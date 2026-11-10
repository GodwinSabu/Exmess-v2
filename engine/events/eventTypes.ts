import type { Asset } from "../config";
import type { TradeType } from "../domain/trade";

export type EngineEvent =
  | {
      type: "OPEN_TRADE";
      payload: {
        orderId: string;
        email: string;
        asset: Asset;
        tradeType: TradeType;
        margin: bigint;
        leverage: number;
        expectedPrice: bigint;
        slippageBps: number;
      };
    }
  | {
      type: "CLOSE_TRADE";
      payload: {
        orderId: string;
        // When set, the trade must belong to this user.
        email?: string;
      };
    }
  | {
      type: "PRICE_UPDATE";
      payload: {
        asset: Asset;
        price: bigint;
        // When the poller observed the price (ms epoch). Defaults to now.
        ts?: number;
      };
    }
  | {
      type: "GET_BALANCE";
      payload: {
        email: string;
      };
    }
  | {
      type: "GET_OPEN_TRADES";
      payload: {
        email: string;
      };
    };
