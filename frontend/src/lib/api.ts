import { API_URL, ASSETS, USDC_DECIMALS, isAssetSymbol } from "../config";
import type { AssetSymbol, IntervalId } from "../config";

/**
 * Typed client for the API server.
 *
 * The trading endpoints speak integers (cents of USDC, smallest price units,
 * basis points). Everything is converted here, at the boundary, so the rest
 * of the UI only ever sees normal numbers: dollars, prices and percent.
 */

export type Side = "long" | "short";

export type Position = {
  orderId: string;
  asset: AssetSymbol;
  side: Side;
  margin: number; // USDC
  leverage: number;
  entryPrice: number;
  liquidationPrice: number;
};

export type ClosedTrade = {
  orderId: string;
  asset: AssetSymbol;
  side: Side;
  leverage: number;
  openPrice: number;
  closePrice: number;
  pnl: number; // USDC
  liquidated: boolean;
  openedAt: string;
};

export type Candle = {
  time: number; // unix seconds, UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Ticker = {
  asset: AssetSymbol;
  lastPrice: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
};

export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached at all. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Can't reach the API server.", 0);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body: fall through to the status check.
  }

  if (!res.ok) {
    throw new ApiError(body?.message || body?.error || `Request failed (${res.status})`, res.status);
  }

  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const fromCents = (cents: number) => cents / 10 ** USDC_DECIMALS;
const toCents = (usdc: number) => Math.round(usdc * 10 ** USDC_DECIMALS);
const fromUnits = (asset: AssetSymbol, units: number) => units / 10 ** ASSETS[asset].decimals;
const toUnits = (asset: AssetSymbol, price: number) => Math.round(price * 10 ** ASSETS[asset].decimals);

/* ---------- session ---------- */

/** Email of the signed-in user. Throws ApiError(401) when signed out. */
export const getSession = () => request<{ email: string }>("/api/v1/me").then((r) => r.email);

/**
 * Ask for a magic sign-in link. Unknown emails are signed up instead, so one
 * form covers both. `devLink` is only present when the server runs outside
 * production (there is no email provider yet).
 */
export async function requestSignInLink(email: string): Promise<{ isNewUser: boolean; devLink?: string }> {
  try {
    const res = await post<{ devLink?: string }>("/api/v1/signin", { email });
    return { isNewUser: false, devLink: res.devLink };
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }

  const res = await post<{ devLink?: string }>("/api/v1/signup", { email });
  return { isNewUser: true, devLink: res.devLink };
}

export const signOut = () => post<unknown>("/api/v1/logout");

/* ---------- trading ---------- */

type RawTrade = {
  orderId: string;
  asset: string;
  type: Side;
  margin: number;
  leverage: number;
  entryPrice: number;
  liquidationPrice: number;
};

function toPosition(raw: RawTrade): Position | null {
  if (!isAssetSymbol(raw.asset)) return null;

  return {
    orderId: raw.orderId,
    asset: raw.asset,
    side: raw.type === "short" ? "short" : "long",
    margin: fromCents(raw.margin),
    leverage: raw.leverage,
    entryPrice: fromUnits(raw.asset, raw.entryPrice),
    liquidationPrice: fromUnits(raw.asset, raw.liquidationPrice),
  };
}

/** Available (free) balance in USDC. */
export const getBalance = () =>
  request<{ balance: number }>("/api/v1/balance").then((r) => fromCents(r.balance));

export const getOpenPositions = () =>
  request<{ trades: RawTrade[] }>("/api/v1/trades/open").then((r) =>
    r.trades.map(toPosition).filter((p): p is Position => p !== null)
  );

type RawClosedTrade = {
  orderId: string;
  asset: string;
  type: Side;
  leverage: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  liquidated: boolean;
  createdAt: string;
};

export async function getTradeHistory(): Promise<ClosedTrade[]> {
  const { trades } = await request<{ trades: RawClosedTrade[] }>("/api/v1/trades/history");
  const result: ClosedTrade[] = [];

  for (const raw of trades) {
    if (!isAssetSymbol(raw.asset)) continue;

    result.push({
      orderId: raw.orderId,
      asset: raw.asset,
      side: raw.type === "short" ? "short" : "long",
      leverage: raw.leverage,
      openPrice: fromUnits(raw.asset, raw.openPrice),
      closePrice: fromUnits(raw.asset, raw.closePrice),
      pnl: fromCents(raw.pnl ?? 0),
      liquidated: raw.liquidated,
      openedAt: raw.createdAt,
    });
  }

  return result;
}

export type OpenTradeInput = {
  asset: AssetSymbol;
  side: Side;
  margin: number; // USDC
  leverage: number;
  slippagePct: number; // 1 = 1%
  expectedPrice: number; // the price on screen when the user clicked
};

export async function openTrade(input: OpenTradeInput): Promise<Position> {
  const res = await post<{ trade: RawTrade }>("/api/v1/create", {
    asset: input.asset,
    type: input.side,
    margin: toCents(input.margin),
    leverage: input.leverage,
    slippage: Math.round(input.slippagePct * 100),
    expectedPrice: toUnits(input.asset, input.expectedPrice),
  });

  const position = toPosition(res.trade);
  if (!position) throw new ApiError("The server returned an unknown asset.", 500);
  return position;
}

export async function closeTrade(position: Position) {
  const res = await post<{ closePrice: number; pnl: number; liquidated: boolean }>("/api/v1/close", {
    orderId: position.orderId,
  });

  return {
    closePrice: fromUnits(position.asset, res.closePrice),
    pnl: fromCents(res.pnl),
    liquidated: res.liquidated,
  };
}

/* ---------- market data ---------- */

export const getCandles = (asset: AssetSymbol, interval: IntervalId, signal?: AbortSignal) =>
  request<{ candles: Candle[] }>(`/api/v1/candles?asset=${asset}&interval=${interval}`, { signal }).then(
    (r) => r.candles
  );

export const getTickers = () =>
  request<{ tickers: Ticker[] }>("/api/v1/tickers").then((r) => r.tickers.filter((t) => isAssetSymbol(t.asset)));
