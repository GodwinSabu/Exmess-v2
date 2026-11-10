import Redis from "ioredis";
import { REDIS_URL } from "./config";

/**
 * The server's link to the rest of the system, all over Redis:
 *
 *   server --XADD engine_stream--> engine --PUBLISH engine_responses--> server
 *   poller --PUBLISH price_updates--> server --WebSocket--> browsers
 */

const ENGINE_STREAM = "engine_stream";
const ENGINE_STREAM_MAXLEN = 10000;
const RESPONSE_CHANNEL = "engine_responses";
const PRICE_CHANNEL = "price_updates";

// Must stay ABOVE the engine's REQUEST_TTL_MS (5s): the engine refuses
// requests older than that, so a request we gave up on can never execute.
const ENGINE_TIMEOUT_MS = 7000;

// A price the poller has not refreshed for this long is treated as offline.
const PRICE_MAX_AGE_MS = 10_000;

export class EngineError extends Error {
  /** "rejected": the engine said no (bad request). "unavailable": no answer. */
  readonly kind: "rejected" | "unavailable";

  constructor(message: string, kind: "rejected" | "unavailable") {
    super(message);
    this.kind = kind;
  }
}

function throttledErrorLog(label: string) {
  let last = 0;
  return (err: Error) => {
    const now = Date.now();
    if (now - last < 10_000) return;
    last = now;
    console.error(`[redis:${label}]`, err.message);
  };
}

// Commands fail fast when Redis is down, so the API answers 503 instead of hanging.
const commands = new Redis(REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
commands.on("error", throttledErrorLog("commands"));

// A connection in subscriber mode cannot run other commands, hence the second one.
const subscriber = new Redis(REDIS_URL);
subscriber.on("error", throttledErrorLog("subscriber"));

// (Re)subscribe on every connect, including the first one after Redis was down.
subscriber.on("ready", () => {
  subscriber
    .subscribe(RESPONSE_CHANNEL, PRICE_CHANNEL)
    .catch(throttledErrorLog("subscribe"));
});

/* ===========================
   ENGINE REQUEST / RESPONSE
=========================== */

type Pending = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();

function onEngineResponse(message: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(message);
  } catch {
    return;
  }

  const request = pending.get(parsed?.requestId);
  if (!request) return; // answered already, timed out, or another server's request

  pending.delete(parsed.requestId);
  clearTimeout(request.timer);

  if (parsed.ok) request.resolve(parsed.data);
  else request.reject(new EngineError(String(parsed.error ?? "Request rejected"), "rejected"));
}

/**
 * Send one event to the engine and wait for its answer.
 * Rejects with EngineError: "rejected" carries the engine's reason
 * (e.g. "Insufficient balance"); "unavailable" means Redis or the engine is down.
 */
export function sendToEngine<T = any>(
  type: string,
  payload: Record<string, unknown>
): Promise<T> {
  const requestId = crypto.randomUUID();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new EngineError("The trading engine is not responding. Try again shortly.", "unavailable"));
    }, ENGINE_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timer });

    commands
      .xadd(
        ENGINE_STREAM,
        "MAXLEN", "~", ENGINE_STREAM_MAXLEN,
        "*",
        "data",
        JSON.stringify({ type, payload, requestId, sentAt: Date.now() })
      )
      .catch(() => {
        pending.delete(requestId);
        clearTimeout(timer);
        reject(new EngineError("The trading engine is unreachable. Try again shortly.", "unavailable"));
      });
  });
}

/* ===========================
   LIVE PRICES
=========================== */

export type PriceTick = {
  asset: string;    // "SOL"
  symbol: string;   // "SOL_USDC"
  price: number;    // mid price, integer in the asset's smallest unit
  bid: number;
  ask: number;
  decimals: number; // price / 10^decimals = human price
  ts: number;       // when the poller saw it (ms epoch)
};

const latestPrices = new Map<string, PriceTick & { receivedAt: number }>();
const priceListeners = new Set<(tick: PriceTick) => void>();

function onPrice(message: string) {
  let tick: PriceTick;
  try {
    tick = JSON.parse(message);
  } catch {
    return;
  }

  if (typeof tick?.asset !== "string" || typeof tick.price !== "number") return;

  latestPrices.set(tick.asset, { ...tick, receivedAt: Date.now() });

  for (const listener of priceListeners) listener(tick);
}

subscriber.on("message", (channel, message) => {
  if (channel === RESPONSE_CHANNEL) onEngineResponse(message);
  else if (channel === PRICE_CHANNEL) onPrice(message);
});

/** Called for every price the poller publishes. Returns an unsubscribe function. */
export function onPriceTick(listener: (tick: PriceTick) => void): () => void {
  priceListeners.add(listener);
  return () => {
    priceListeners.delete(listener);
  };
}

/** Latest known price per asset; `stale` is true when the feed stopped refreshing it. */
export function getLatestPrices(): (PriceTick & { stale: boolean })[] {
  const now = Date.now();

  return Array.from(latestPrices.values(), ({ receivedAt, ...tick }) => ({
    ...tick,
    stale: now - receivedAt > PRICE_MAX_AGE_MS,
  }));
}

/** Latest price for an asset, or null when there is none or it is stale. */
export function getFreshPrice(asset: string): PriceTick | null {
  const cached = latestPrices.get(asset);
  if (!cached) return null;

  const { receivedAt, ...tick } = cached;
  return Date.now() - receivedAt > PRICE_MAX_AGE_MS ? null : tick;
}
