export const PORT = 8000;

export const JWT_SECRET = "dev-secret-change-this";

export const BACKEND_URL = "http://localhost:8000";
export const FRONTEND_URL = "http://localhost:3000";

export const NODE_ENV = "development";

export const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Assets the API accepts, mapped to their Backpack market symbol.
export const MARKETS = {
  SOL: "SOL_USDC",
  BTC: "BTC_USDC",
  ETH: "ETH_USDC",
} as const;

export type AssetSymbol = keyof typeof MARKETS;

export const isAssetSymbol = (value: unknown): value is AssetSymbol =>
  typeof value === "string" && Object.hasOwn(MARKETS, value);
