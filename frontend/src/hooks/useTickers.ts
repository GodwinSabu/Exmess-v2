import { useEffect, useState } from "react";
import { getTickers } from "../lib/api";
import type { Ticker } from "../lib/api";
import type { AssetSymbol } from "../config";

export type Tickers = Partial<Record<AssetSymbol, Ticker>>;

const REFRESH_MS = 10_000;

/** 24h stats (change, high, low, volume) for every asset, refreshed periodically. */
export function useTickers(): Tickers {
  const [tickers, setTickers] = useState<Tickers>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const list = await getTickers();
        if (cancelled) return;

        const next: Tickers = {};
        for (const ticker of list) next[ticker.asset] = ticker;
        setTickers(next);
      } catch {
        // Keep the last known stats; the live price still updates on its own.
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  return tickers;
}

/**
 * 24h change measured against the live price, so it moves with every tick
 * instead of waiting for the next stats refresh.
 */
export function liveChange(ticker: Ticker | undefined, livePrice: number | undefined) {
  if (!ticker) return { change: undefined, percent: undefined };

  const open = ticker.lastPrice - ticker.change;
  const price = livePrice ?? ticker.lastPrice;

  if (!(open > 0)) return { change: undefined, percent: undefined };

  return { change: price - open, percent: ((price - open) / open) * 100 };
}
