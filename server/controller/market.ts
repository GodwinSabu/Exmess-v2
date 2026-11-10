import { jsonResponse } from "../utills/jsonResponse";
import { MARKETS, isAssetSymbol } from "../config";
import type { AssetSymbol } from "../config";
import { getLatestPrices } from "../engine";

/**
 * Market data for the chart and the watchlist.
 *
 * Live prices come from our own poller (via Redis). Candle history and 24h
 * stats are proxied from Backpack's public REST API, the same exchange the
 * poller streams from, so the browser only ever talks to this server.
 *
 * Candles and tickers are in normal human units (85.31), unlike the trading
 * endpoints which use integer smallest-units.
 */

const BACKPACK_API = "https://api.backpack.exchange/api/v1";

// interval -> seconds per candle
const INTERVALS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

const CANDLE_COUNT = 600;

type BackpackKline = {
  start: string; // "2026-11-10 10:10:00" (UTC)
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type BackpackTicker = {
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string; // fraction: "-0.0097" = -0.97%
  high: string;
  low: string;
  volume: string;
  quoteVolume: string;
};

// Small TTL cache so several tabs or fast refetches share one upstream call.
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = load();
  cache.set(key, { expires: Date.now() + ttlMs, value });

  // Never keep a failure around.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });

  return value;
}

async function backpack<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKPACK_API}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Backpack responded with ${res.status}`);

  return (await res.json()) as T;
}

const fail = (message: string, status: number) =>
  jsonResponse({ success: false, message }, status);

/** GET /api/v1/prices - latest price per asset from the poller. */
export const getPrices = async (_req: Request): Promise<Response> => {
  return jsonResponse({ success: true, prices: getLatestPrices() });
};

/** GET /api/v1/candles?asset=SOL&interval=1m - OHLCV history, oldest first. */
export const getCandles = async (req: Request): Promise<Response> => {
  const params = new URL(req.url).searchParams;
  const asset = params.get("asset");
  const interval = params.get("interval") ?? "1m";
  const seconds = INTERVALS[interval];

  if (!isAssetSymbol(asset)) {
    return fail("Invalid asset. Supported assets are SOL, ETH, BTC", 400);
  }

  if (!seconds) {
    return fail(`Invalid interval. Supported intervals are ${Object.keys(INTERVALS).join(", ")}`, 400);
  }

  try {
    const candles = await cached(`candles:${asset}:${interval}`, 2000, async () => {
      const startTime = Math.floor(Date.now() / 1000) - seconds * CANDLE_COUNT;

      const rows = await backpack<BackpackKline[]>(
        `/klines?symbol=${MARKETS[asset]}&interval=${interval}&startTime=${startTime}`
      );

      return rows
        .map((row) => ({
          time: Date.parse(`${row.start.replace(" ", "T")}Z`) / 1000,
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume),
        }))
        .filter((candle) => Number.isFinite(candle.time) && Number.isFinite(candle.close));
    });

    return jsonResponse({ success: true, asset, interval, candles });
  } catch (err) {
    console.error("Candles error:", err);
    return fail("Could not load candles from the exchange", 502);
  }
};

/** GET /api/v1/tickers - 24h stats for every supported asset. */
export const getTickers = async (_req: Request): Promise<Response> => {
  try {
    const tickers = await cached("tickers", 5000, () =>
      Promise.all(
        (Object.keys(MARKETS) as AssetSymbol[]).map(async (asset) => {
          const t = await backpack<BackpackTicker>(`/ticker?symbol=${MARKETS[asset]}`);

          return {
            asset,
            lastPrice: Number(t.lastPrice),
            change: Number(t.priceChange),
            changePercent: Number(t.priceChangePercent) * 100,
            high: Number(t.high),
            low: Number(t.low),
            volume: Number(t.volume),
            quoteVolume: Number(t.quoteVolume),
          };
        })
      )
    );

    return jsonResponse({ success: true, tickers });
  } catch (err) {
    console.error("Tickers error:", err);
    return fail("Could not load 24h stats from the exchange", 502);
  }
};
