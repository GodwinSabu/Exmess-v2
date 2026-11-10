import { jsonResponse } from "../utills/jsonResponse";
import { isAssetSymbol } from "../config";
import { EngineError, getFreshPrice, sendToEngine } from "../engine";
import { prisma } from "../../packages/db";

/**
 * Units used by every trading endpoint (same as the engine):
 *   margin / balance / pnl -> integer cents of USDC     (100 = $1.00)
 *   prices                 -> integer in the asset's smallest unit
 *   slippage               -> basis points              (100 = 1%)
 */

interface CreateTradeRequest {
    asset: 'SOL' | 'ETH' | 'BTC';
    type: 'long' | 'short';
    margin: number;
    leverage: number;
    slippage: number;
    // Price the user saw when they clicked. Defaults to the latest price.
    expectedPrice?: number;
  }

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const fail = (message: string, status: number) =>
  jsonResponse({ success: false, message }, status);

/** Engine said no -> 400 with its reason. Engine/Redis down -> 503. */
function engineFailure(err: unknown): Response {
  if (err instanceof EngineError) {
    return fail(err.message, err.kind === "rejected" ? 400 : 503);
  }

  console.error("Trade controller error:", err);
  return fail("Internal Server Error", 500);
}

async function readJson(req: Request): Promise<any | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export const createTrade = async (req: Request): Promise<Response> => {
  try {
    // logic
    const email = (req as any).user?.email;
        if (!email) {
            return fail("Unauthorized Access", 401);
        }

        const tradeData = await readJson(req) as CreateTradeRequest | null;

        if (!tradeData) {
            return fail("Request body must be JSON", 400);
        }

        if (!isInt(tradeData.margin) || !isInt(tradeData.leverage) || !isInt(tradeData.slippage)) {
            return fail("margin, leverage and slippage must be whole numbers", 400);
        }

        if (tradeData.margin <= 99) {
            return fail("Margin must be greater than 0.99", 400);
        }

        if (!isAssetSymbol(tradeData.asset)) {
            return fail("Invalid asset. Supported assets are SOL, ETH, BTC", 400);
        }

        if (!['long', 'short'].includes(tradeData.type)) {
            return fail("Invalid trade type. Supported types are long and short", 400);
        }

        if (tradeData.leverage < 1 || tradeData.leverage > 100) {
            return fail("Leverage must be between 1 and 100", 400);
        }

        if (tradeData.slippage > 10000 || tradeData.slippage < 10) {
            return fail("Slippage value should be between 0.1 to 100 %", 400);
        }

        if (
            tradeData.expectedPrice !== undefined &&
            (!isInt(tradeData.expectedPrice) || tradeData.expectedPrice <= 0)
        ) {
            return fail("expectedPrice must be a positive whole number", 400);
        }

        // Fail fast when the poller is down, before anything is queued.
        const latest = getFreshPrice(tradeData.asset);

        if (!latest) {
            return fail(`Price feed is offline for ${tradeData.asset}. Try again in a moment.`, 503);
        }

        const orderId = crypto.randomUUID();

        const result = await sendToEngine("OPEN_TRADE", {
            orderId,
            email,
            asset: tradeData.asset,
            tradeType: tradeData.type,
            margin: String(tradeData.margin),
            leverage: tradeData.leverage,
            expectedPrice: String(tradeData.expectedPrice ?? latest.price),
            slippageBps: tradeData.slippage
        });

        return jsonResponse({
            success: true,
            message: "Trade created successfully",
            orderId,
            trade: result.trade,
            balance: result.balance
        });
  } catch (err) {
    // error
    return engineFailure(err);
  }
};

export const closeTrade = async (req: Request): Promise<Response> => {
  try {
    const email = (req as any).user?.email;
    if (!email) return fail("Unauthorized Access", 401);

    const body = await readJson(req);

    if (!body || typeof body.orderId !== "string" || body.orderId.length === 0) {
      return fail("orderId is required", 400);
    }

    // The engine checks the trade belongs to this user.
    const result = await sendToEngine("CLOSE_TRADE", { orderId: body.orderId, email });

    return jsonResponse({ success: true, message: "Trade closed successfully", ...result });
  } catch (err) {
    return engineFailure(err);
  }
};

export const getBalance = async (req: Request): Promise<Response> => {
  try {
    const email = (req as any).user?.email;
    if (!email) return fail("Unauthorized Access", 401);

    const result = await sendToEngine("GET_BALANCE", { email });

    return jsonResponse({ success: true, balance: result.balance, decimals: result.decimals });
  } catch (err) {
    return engineFailure(err);
  }
};

export const getOpenTrades = async (req: Request): Promise<Response> => {
  try {
    const email = (req as any).user?.email;
    if (!email) return fail("Unauthorized Access", 401);

    const result = await sendToEngine("GET_OPEN_TRADES", { email });

    return jsonResponse({ success: true, trades: result.trades });
  } catch (err) {
    return engineFailure(err);
  }
};

/** Closed and liquidated trades, newest first. Read from Postgres, not the engine. */
export const getTradeHistory = async (req: Request): Promise<Response> => {
  try {
    const email = (req as any).user?.email;
    if (!email) return fail("Unauthorized Access", 401);

    const trades = await prisma.trade.findMany({
      where: { user: { email }, closePrice: { not: null } },
      include: { asset: true },
      orderBy: { id: "desc" },
      take: 100
    });

    return jsonResponse({
      success: true,
      trades: trades.map((trade) => ({
        orderId: trade.orderId,
        asset: trade.asset.symbol,
        type: trade.tradeType === "SHORT" ? "short" : "long",
        leverage: trade.leverage,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice,
        pnl: trade.pnl,
        liquidated: trade.liquidated,
        createdAt: trade.createdAt
      }))
    });
  } catch (err) {
    console.error("Trade history error:", err);
    return fail("Could not load trade history", 500);
  }
};
