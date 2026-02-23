import type { Asset } from "../config";

export type TradeType = "long" | "short";

export interface Trade {
  orderId: string;
  email: string;
  asset: Asset;
  type: TradeType;
  margin: bigint;        // stored in smallest USDC unit
  leverage: number;
  entryPrice: bigint;    // stored in smallest asset unit
  liquidationPrice: bigint;
  status: "open" | "closed";
}