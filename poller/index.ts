import WebSocket from "ws";
import {
  assets,
  WS_URL,
  ENGINE_STREAM,
  ENGINE_STREAM_MAXLEN,
  PRICE_CHANNEL,
  PUBLISH_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS
} from "./config";
import { decimals, latestPrices } from "./store";
import { redis } from "./redis";

let ws: WebSocket | null = null;
let requestId = 1;

// Symbols whose price changed since the last publish.
const dirty = new Set<string>();

// When each symbol was last published (ms epoch).
const lastPublishedAt: Record<string, number> = {};

let lastRedisErrorAt = 0;

/** "SOL_USDC" -> "SOL" (the engine and API key assets by base symbol). */
function toAsset(symbol: string): string {
  return symbol.split("_")[0] ?? symbol;
}

/** 85.315 with 6 decimals -> 85315000 (integer in the asset's smallest unit). */
function toUnits(value: number, decimal: number): number {
  return Math.round(value * 10 ** decimal);
}

function connectWS() {

  ws = new WebSocket(WS_URL);

  ws.on("open", () => {

    console.log("Connected to Backpack WS");

    assets.forEach((asset) => {

      const msg = {
        method: "SUBSCRIBE",
        params: [`bookTicker.${asset}`],
        id: requestId++
      };

      ws!.send(JSON.stringify(msg));

      console.log("Subscribed:", asset);

    });

  });

  ws.on("message", (msg) => {

    try {

      const parsed = JSON.parse(msg.toString());

      if (parsed?.data?.e !== "bookTicker") return;

      const symbol = parsed.data.s;

      const ask = parseFloat(parsed.data.a);
      const bid = parseFloat(parsed.data.b);

      if (isNaN(ask) || isNaN(bid)) return;

      const mid = (ask + bid) / 2;

      latestPrices[symbol] = {
        price: mid,
        decimal: decimals[symbol] ?? 0,
        bid,
        ask
      };

      dirty.add(symbol);

    } catch (err) {

      console.error("WS parse error:", err);    

    }

  });

  ws.on("error", (err) => {

    console.error("WebSocket error:", err);

  });

  ws.on("close", () => {

    console.log("WS closed. Reconnecting in 5s...");

    ws = null;

    setTimeout(connectWS, 5000);

  });

}

/**
 * Push the latest prices to Redis:
 *  - PRICE_CHANNEL (pub/sub)  -> API server -> browsers (live UI prices)
 *  - ENGINE_STREAM (stream)   -> engine (execution price + liquidations)
 *
 * Runs on a timer so a burst of bookTicker messages collapses into one
 * publish per asset. Nothing is published while the exchange socket is
 * down, so downstream consumers see the feed go stale instead of trusting
 * an old price.
 */
async function publishPrices() {

  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Redis down: skip instead of queueing a backlog of stale prices.
  if (redis.status !== "ready") return;

  const now = Date.now();
  const pipeline = redis.pipeline();
  let queued = 0;

  for (const symbol of assets) {

    const latest = latestPrices[symbol];
    if (!latest) continue;

    const changed = dirty.has(symbol);
    const heartbeatDue =
      now - (lastPublishedAt[symbol] ?? 0) >= HEARTBEAT_INTERVAL_MS;

    if (!changed && !heartbeatDue) continue;

    dirty.delete(symbol);
    lastPublishedAt[symbol] = now;

    const asset = toAsset(symbol);
    const price = toUnits(latest.price, latest.decimal);

    pipeline.publish(
      PRICE_CHANNEL,
      JSON.stringify({
        asset,
        symbol,
        price,
        bid: toUnits(latest.bid, latest.decimal),
        ask: toUnits(latest.ask, latest.decimal),
        decimals: latest.decimal,
        ts: now
      })
    );

    pipeline.xadd(
      ENGINE_STREAM,
      "MAXLEN",
      "~",
      ENGINE_STREAM_MAXLEN,
      "*",
      "data",
      JSON.stringify({
        type: "PRICE_UPDATE",
        payload: { asset, price: String(price), ts: now }
      })
    );

    queued++;
  }

  if (queued === 0) return;

  try {
    await pipeline.exec();
  } catch (err) {
    // Redis down: don't spam the console on every tick.
    if (now - lastRedisErrorAt > 5000) {
      lastRedisErrorAt = now;
      console.error("Failed to publish prices to Redis:", err);
    }
  }
}

connectWS();

setInterval(publishPrices, PUBLISH_INTERVAL_MS);

// One status line every 30s instead of one line per tick.
setInterval(() => {
  const summary = assets
    .map((symbol) => {
      const latest = latestPrices[symbol];
      return `${toAsset(symbol)}=${latest ? latest.price : "n/a"}`;
    })
    .join("  ");
  console.log("Prices:", summary);
}, 30000);
