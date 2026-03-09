import type { EngineEvent } from "./eventTypes";
import { getWallet, debitWallet, creditWallet } from "../state/walletStore";
import { saveTrade, getTrade, getOpenTradesByAsset, closeTrade } from "../state/tradesStore";
import { setPrice, getPrice } from "../state/priceStore";
import { calculateLiquidationPrice } from "../domain/liquidation";
import { calculatePnL } from "../domain/pnl";
import type { Trade } from "../domain/trade";
import { validateSlippage } from "../domain/slippage";
import { queueDBOperation } from "../infra/dbQueue";

export async function processEvent(event: EngineEvent) {

  switch (event.type) {

    case "OPEN_TRADE": {
      const { orderId, email, asset, tradeType, margin, leverage, expectedPrice, slippageBps } = event.payload;

      const currentPrice = getPrice(asset);

validateSlippage  (
    expectedPrice,
  currentPrice,
  slippageBps
);

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
        openPrice: currentPrice,
        leverage,
        liquidated: false,
        assetId: asset,
        tradeType
      }); 

      break;
    }

    case "CLOSE_TRADE": {
      const { orderId } = event.payload;

      const trade = getTrade(orderId);
      if (!trade) throw new Error("Trade not found");

      const currentPrice = getPrice(trade.asset);

      const { pnl, isLiquidated } = calculatePnL(trade, currentPrice);

      creditWallet(trade.email, trade.margin + pnl);

      closeTrade(orderId);
      await queueDBOperation("UPDATE_TRADE", {
        orderId,
        closePrice: currentPrice,
        pnl: Number(pnl),
        liquidated: isLiquidated
      });

      break;
    }

    case "PRICE_UPDATE": {
      const { asset, price } = event.payload;

      setPrice(asset, price);

      const openTrades = getOpenTradesByAsset(asset);

      for (const trade of openTrades) {
        const { isLiquidated } = calculatePnL(trade, price);

        if (isLiquidated) {
          closeTrade(trade.orderId);
        }
      }

      break;
    }
  }
}