import { useCallback, useSyncExternalStore } from "react";
import { ASSETS, WS_URL, isAssetSymbol } from "../config";
import type { AssetSymbol } from "../config";

/**
 * Live prices: poller -> Redis -> API server -> this WebSocket.
 *
 * Kept outside React on purpose. Prices tick several times a second, so
 * components subscribe to exactly what they show (one asset, or a throttled
 * view of all of them) instead of re-rendering the whole app on every tick.
 */

export type Quote = {
  asset: AssetSymbol;
  price: number; // mid price: what trades execute at
  bid: number;
  ask: number;
  /** Which way the price last moved: 1 up, -1 down, 0 unknown. */
  move: 1 | -1 | 0;
};

/**
 * connecting: socket opening, no price yet
 * live:       prices are flowing
 * stale:      connected to the server, but the poller stopped sending prices
 * offline:    cannot reach the server (retrying)
 */
export type FeedStatus = "connecting" | "live" | "stale" | "offline";

type Quotes = Readonly<Partial<Record<AssetSymbol, Quote>>>;

// The poller sends at least one price per asset every second.
const STALE_AFTER_MS = 5000;

// "All quotes" subscribers (positions table, equity) update at most this often.
const ALL_NOTIFY_MS = 200;

const latest = new Map<AssetSymbol, Quote>();
const assetListeners = new Map<AssetSymbol, Set<() => void>>();

let allSnapshot: Quotes = {};
const allListeners = new Set<() => void>();
let allTimer: ReturnType<typeof setTimeout> | null = null;

let status: FeedStatus = "connecting";
const statusListeners = new Set<() => void>();

let socket: WebSocket | null = null;
let started = false;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let staleTimer: ReturnType<typeof setInterval> | null = null;
let lastFreshAt = 0;

function setStatus(next: FeedStatus) {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener();
}

function publishAll() {
  allTimer = null;
  allSnapshot = Object.fromEntries(latest) as Quotes;
  for (const listener of allListeners) listener();
}

function ingest(raw: any, fresh: boolean) {
  if (!isAssetSymbol(raw?.asset) || typeof raw.price !== "number") return;

  const asset: AssetSymbol = raw.asset;
  const scale = 10 ** (typeof raw.decimals === "number" ? raw.decimals : ASSETS[asset].decimals);
  const price = raw.price / scale;
  const bid = typeof raw.bid === "number" ? raw.bid / scale : price;
  const ask = typeof raw.ask === "number" ? raw.ask / scale : price;

  if (fresh) {
    lastFreshAt = Date.now();
    setStatus("live");
  }

  const previous = latest.get(asset);

  // Heartbeats repeat the same price: nothing to re-render.
  if (previous && previous.price === price && previous.bid === bid && previous.ask === ask) return;

  const move = !previous || price === previous.price ? (previous?.move ?? 0) : price > previous.price ? 1 : -1;

  latest.set(asset, { asset, price, bid, ask, move });

  const listeners = assetListeners.get(asset);
  if (listeners) for (const listener of listeners) listener();

  if (allTimer === null) allTimer = setTimeout(publishAll, ALL_NOTIFY_MS);
}

function connect() {
  retryTimer = null;

  const ws = new WebSocket(WS_URL);
  socket = ws;

  ws.onopen = () => {
    retries = 0;
    lastFreshAt = Date.now(); // start the stale countdown from now
    setStatus("connecting");
  };

  ws.onmessage = (event) => {
    let message: any;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (message?.type === "price") {
      ingest(message, true);
    } else if (message?.type === "snapshot" && Array.isArray(message.prices)) {
      for (const price of message.prices) ingest(price, price?.stale === false);
    }
  };

  ws.onerror = () => ws.close();

  ws.onclose = () => {
    if (socket !== ws) return; // an older socket, already replaced
    socket = null;
    setStatus("offline");
    retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 5000));
  };
}

/** Open the price socket. Safe to call more than once. */
export function startPriceFeed() {
  if (started) return;
  started = true;

  connect();

  staleTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN && Date.now() - lastFreshAt > STALE_AFTER_MS) {
      setStatus("stale");
    }
  }, 1000);
}

function stopPriceFeed() {
  started = false;
  if (retryTimer) clearTimeout(retryTimer);
  if (staleTimer) clearInterval(staleTimer);
  if (allTimer) clearTimeout(allTimer);
  const ws = socket;
  socket = null;
  ws?.close();
}

// Hot reload replaces this module: close the old socket so they don't pile up.
if (import.meta.hot) {
  import.meta.hot.dispose(stopPriceFeed);
}

function subscribeAsset(asset: AssetSymbol, listener: () => void): () => void {
  let listeners = assetListeners.get(asset);
  if (!listeners) assetListeners.set(asset, (listeners = new Set()));
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Latest quote for an asset, read right now (no subscription). */
export const getQuote = (asset: AssetSymbol): Quote | undefined => latest.get(asset);

/** Imperative subscription, for code outside React rendering (the chart). */
export function subscribeQuote(asset: AssetSymbol, listener: (quote: Quote) => void): () => void {
  return subscribeAsset(asset, () => {
    const quote = latest.get(asset);
    if (quote) listener(quote);
  });
}

/** Live quote for one asset. Re-renders only when that asset changes. */
export function useQuote(asset: AssetSymbol): Quote | undefined {
  const subscribe = useCallback((listener: () => void) => subscribeAsset(asset, listener), [asset]);
  return useSyncExternalStore(subscribe, () => latest.get(asset));
}

function subscribeAll(listener: () => void): () => void {
  allListeners.add(listener);
  return () => {
    allListeners.delete(listener);
  };
}

/** Every asset's quote, updated a few times a second at most. */
export function useQuotes(): Quotes {
  return useSyncExternalStore(subscribeAll, () => allSnapshot);
}

function subscribeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function useFeedStatus(): FeedStatus {
  return useSyncExternalStore(subscribeStatus, () => status);
}
