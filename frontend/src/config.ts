/**
 * The API server (REST + WebSocket) runs on port 8000 of the same host.
 * It sets the session cookie, so every request is sent with credentials.
 */
export const API_URL = `${location.protocol}//${location.hostname}:8000`;

export const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8000/ws`;

/** Balances, margin and PnL travel as integer cents of USDC. */
export const USDC_DECIMALS = 2;

export type AssetSymbol = "BTC" | "ETH" | "SOL";

export type AssetInfo = {
  symbol: AssetSymbol;
  name: string;
  /** Prices travel as integers: price / 10^decimals. Must match engine/config.ts. */
  decimals: number;
  /** Digits shown after the decimal point. */
  precision: number;
};

export const ASSETS: Record<AssetSymbol, AssetInfo> = {
  BTC: { symbol: "BTC", name: "Bitcoin", decimals: 4, precision: 2 },
  ETH: { symbol: "ETH", name: "Ethereum", decimals: 6, precision: 2 },
  SOL: { symbol: "SOL", name: "Solana", decimals: 6, precision: 3 },
};

export const ASSET_LIST: AssetInfo[] = [ASSETS.BTC, ASSETS.ETH, ASSETS.SOL];

export const isAssetSymbol = (value: unknown): value is AssetSymbol =>
  typeof value === "string" && Object.hasOwn(ASSETS, value);

export const INTERVALS = [
  { id: "1m", label: "1m", seconds: 60 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "1h", label: "1h", seconds: 3600 },
  { id: "4h", label: "4h", seconds: 14400 },
  { id: "1d", label: "1D", seconds: 86400 },
] as const;

export type IntervalId = (typeof INTERVALS)[number]["id"];

export const isIntervalId = (value: unknown): value is IntervalId =>
  INTERVALS.some((interval) => interval.id === value);

/** Order limits enforced by the API (server/controller/trade.ts). */
export const LIMITS = {
  minMargin: 1, // USDC
  minLeverage: 1,
  maxLeverage: 100,
  minSlippagePct: 0.1,
  maxSlippagePct: 100,
};
