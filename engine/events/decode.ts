import { ASSET_CONFIG } from "../config";
import type { Asset } from "../config";
import type { EngineEvent } from "./eventTypes";

/**
 * Events reach the engine as JSON, which has no bigint. This turns raw JSON
 * into a typed EngineEvent (amounts become bigint) and rejects anything
 * malformed before it can touch engine state.
 */

function toBigInt(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error(`Invalid ${field}`);
}

function toText(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Invalid ${field}`);
}

function toNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`Invalid ${field}`);
}

function toAsset(value: unknown): Asset {
  if (typeof value === "string" && Object.hasOwn(ASSET_CONFIG, value)) {
    return value as Asset;
  }
  throw new Error(`Unsupported asset: ${String(value)}`);
}

export function decodeEvent(raw: any): EngineEvent {
  const payload = raw?.payload ?? {};

  switch (raw?.type) {

    case "OPEN_TRADE": {
      const tradeType = payload.tradeType;
      if (tradeType !== "long" && tradeType !== "short") {
        throw new Error("Invalid tradeType");
      }

      return {
        type: "OPEN_TRADE",
        payload: {
          orderId: toText(payload.orderId, "orderId"),
          email: toText(payload.email, "email"),
          asset: toAsset(payload.asset),
          tradeType,
          margin: toBigInt(payload.margin, "margin"),
          leverage: toNumber(payload.leverage, "leverage"),
          expectedPrice: toBigInt(payload.expectedPrice, "expectedPrice"),
          slippageBps: toNumber(payload.slippageBps, "slippageBps")
        }
      };
    }

    case "CLOSE_TRADE":
      return {
        type: "CLOSE_TRADE",
        payload: {
          orderId: toText(payload.orderId, "orderId"),
          email: payload.email === undefined ? undefined : toText(payload.email, "email")
        }
      };

    case "PRICE_UPDATE":
      return {
        type: "PRICE_UPDATE",
        payload: {
          asset: toAsset(payload.asset),
          price: toBigInt(payload.price, "price"),
          ts: typeof payload.ts === "number" ? payload.ts : undefined
        }
      };

    case "GET_BALANCE":
      return { type: "GET_BALANCE", payload: { email: toText(payload.email, "email") } };

    case "GET_OPEN_TRADES":
      return { type: "GET_OPEN_TRADES", payload: { email: toText(payload.email, "email") } };

    default:
      throw new Error(`Unknown event type: ${String(raw?.type)}`);
  }
}
