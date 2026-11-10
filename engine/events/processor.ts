import type { EngineEvent } from "./eventTypes";
import { getWallet, debitWallet, creditWallet } from "../state/walletStore";
import {
  saveTrade,
  getTrade,
  getOpenTradesByAsset,
  getOpenTradesByEmail,
  closeTrade
} from "../state/tradesStore";
import { setPrice, getFreshPrice } from "../state/priceStore";
import { calculateLiquidationPrice } from "../domain/liquidation";
import { calculatePnL } from "../domain/pnl";
import type { Trade } from "../domain/trade";
import { validateSlippage } from "../domain/slippage";
import { queueDBOperation } from "../infra/dbQueue";
import { USDC_DECIMALS } from "../config";

/**
 * Applies one event to engine state. Returns the result for request/response
 * events (the Redis consumer sends it back to the API server) and throws when
 * the event is rejected, e.g. "Insufficient balance" or "Slippage exceeded".
 */
export async function processEvent(event: EngineEvent): Promise<unknown> {

  switch (event.type) {

    case "OPEN_TRADE": {
      const { orderId, email, asset, tradeType, margin, leverage, expectedPrice, slippageBps } = event.payload;

      if (margin <= 0n) throw new Error("Invalid margin");
      if (!(leverage >= 1 && leverage <= 100)) throw new Error("Invalid leverage");
      if (getTrade(orderId)) throw new Error("Duplicate orderId");

      const currentPrice = getFreshPrice(asset);

      validateSlippage(expectedPrice, currentPrice, slippageBps);

      debitWallet(email, margin);

      const liquidationPrice = calculateLiquidationPrice(
        tradeType,
        currentPrice,
        margin,
        leverage,
        asset
      );

      const trade: Trade = {
        orderId,
        email,
        asset,
        type: tradeType,
        margin,
        leverage,
        entryPrice: currentPrice,
        liquidationPrice,
        status: "open"
      };

      saveTrade(trade);

      // 2️⃣ Push event to DB queue
      await queueDBOperation("CREATE_TRADE", {
        orderId,
        email,
        openPrice: Number(currentPrice),
        leverage,
        liquidated: false,
        asset,
        tradeType
      });

      return { trade, balance: getWallet(email) };
    }

    case "CLOSE_TRADE": {
      const { orderId, email } = event.payload;

      const trade = getTrade(orderId);
      if (!trade) throw new Error("Trade not found");

      // Another user's trade looks exactly like a missing one.
      if (email !== undefined && trade.email !== email) throw new Error("Trade not found");

      // Without this a second CLOSE would pay the margin out twice.
      if (trade.status !== "open") throw new Error("Trade is already closed");

      const currentPrice = getFreshPrice(trade.asset);

      const { pnl, isLiquidated } = calculatePnL(trade, currentPrice);

      const payout = trade.margin + pnl;
      creditWallet(trade.email, payout > 0n ? payout : 0n);

      closeTrade(orderId);
      await queueDBOperation("UPDATE_TRADE", {
        orderId,
        closePrice: Number(currentPrice),
        pnl: Number(pnl),
        liquidated: isLiquidated
      });

      return {
        orderId,
        closePrice: currentPrice,
        pnl,
        liquidated: isLiquidated,
        balance: getWallet(trade.email)
      };
    }

    case "PRICE_UPDATE": {
      const { asset, price, ts } = event.payload;

      if (price <= 0n) throw new Error("Invalid price");

      setPrice(asset, price, ts);

      const openTrades = getOpenTradesByAsset(asset);

      for (const trade of openTrades) {
        const { isLiquidated } = calculatePnL(trade, price);

        if (isLiquidated) {
          closeTrade(trade.orderId);

          // The margin is gone; record it so trade history shows the liquidation.
          await queueDBOperation("UPDATE_TRADE", {
            orderId: trade.orderId,
            closePrice: Number(price),
            pnl: Number(-trade.margin),
            liquidated: true
          });
        }
      }

      return;
    }

    case "GET_BALANCE": {
      // getWallet() opens a wallet with the default balance on first use.
      return { balance: getWallet(event.payload.email), decimals: USDC_DECIMALS };
    }

    case "GET_OPEN_TRADES": {
      return { trades: getOpenTradesByEmail(event.payload.email) };
    }
  }
}
