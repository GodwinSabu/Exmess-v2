import dotenv from "dotenv";
dotenv.config();

export const REDIS_URL =
  process.env.REDIS_URL || "redis://localhost:6379";

export const WS_URL = "wss://ws.backpack.exchange/";

export const assets = ["SOL_USDC", "BTC_USDC", "ETH_USDC"];

// Stream the engine consumes (PRICE_UPDATE events drive pricing + liquidations).
export const ENGINE_STREAM = "engine_stream";

// Pub/sub channel the API server relays to browsers over its WebSocket.
export const PRICE_CHANNEL = "price_updates";

// bookTicker fires many times a second. Publish at most this often per asset.
export const PUBLISH_INTERVAL_MS = 250;

// Re-publish an unchanged price this often so consumers can tell
// "quiet market" apart from "poller is down".
export const HEARTBEAT_INTERVAL_MS = 1000;

// Keep the engine stream bounded.
export const ENGINE_STREAM_MAXLEN = 10000;
