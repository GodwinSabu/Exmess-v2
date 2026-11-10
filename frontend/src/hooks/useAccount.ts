import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { ApiError } from "../lib/api";
import type { ClosedTrade, OpenTradeInput, Position } from "../lib/api";
import { formatPrice, formatSignedUsd } from "../lib/format";
import { showToast } from "../lib/toast";
import { ASSETS } from "../config";

export type Session =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; email: string };

const POLL_MS = 2000;

// The DB is written asynchronously (engine -> Redis -> dbProcessor -> Postgres),
// so a just-closed trade needs a moment before it shows up in history.
const HISTORY_DELAY_MS = 900;

// ...and a second look a little later, in case the write was slow.
const HISTORY_RETRY_MS = 4000;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

function samePositions(a: Position[], b: Position[]) {
  return a.length === b.length && a.every((p, i) => p.orderId === b[i]?.orderId);
}

/**
 * Everything about the signed-in user: session, balance, open positions and
 * trade history, plus the actions that change them. Balance and positions
 * are polled from the engine (through the API) every couple of seconds.
 */
export function useAccount() {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [balance, setBalance] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  const [closing, setClosing] = useState<ReadonlySet<string>>(new Set());
  // Why balance/positions could not be refreshed (engine or server down), if so.
  const [accountError, setAccountError] = useState<string | null>(null);

  const known = useRef(new Map<string, Position>()); // positions seen on the last poll
  const closedHere = useRef(new Set<string>()); // closed from this tab
  const polling = useRef(false);

  const reset = useCallback(() => {
    setBalance(null);
    setPositions([]);
    setHistory([]);
    setAccountError(null);
    known.current.clear();
    closedHere.current.clear();
  }, []);

  const refreshHistory = useCallback(async (): Promise<ClosedTrade[] | null> => {
    try {
      const trades = await api.getTradeHistory();
      setHistory(trades);
      return trades;
    } catch {
      return null; // history is secondary: keep showing what we have
    }
  }, []);

  /** A position vanished without being closed here: the engine liquidated it. */
  const reportVanished = useCallback(
    (vanished: Position[]) => {
      setTimeout(async () => {
        const trades = await refreshHistory();

        for (const position of vanished) {
          const record = trades?.find((trade) => trade.orderId === position.orderId);

          if (record?.liquidated) {
            showToast(
              "warning",
              `${position.asset} ${position.side} liquidated`,
              `The price reached ${formatPrice(position.liquidationPrice, ASSETS[position.asset].precision)} and the margin was lost.`
            );
          } else if (!record) {
            // Not in history yet, so we cannot tell why it closed.
            showToast(
              "warning",
              `${position.asset} ${position.side} is no longer open`,
              "It was closed outside this tab, possibly by liquidation. Check History."
            );
            setTimeout(refreshHistory, HISTORY_RETRY_MS);
          }
          // Otherwise it was closed normally from another tab: nothing to report.
        }
      }, HISTORY_DELAY_MS);
    },
    [refreshHistory]
  );

  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;

    try {
      const [nextBalance, open] = await Promise.all([api.getBalance(), api.getOpenPositions()]);

      setBalance(nextBalance);
      setPositions((previous) => (samePositions(previous, open) ? previous : open));
      setAccountError(null);

      const openIds = new Set(open.map((position) => position.orderId));
      const vanished = [...known.current.values()].filter(
        (position) => !openIds.has(position.orderId) && !closedHere.current.has(position.orderId)
      );

      known.current = new Map(open.map((position) => [position.orderId, position]));

      if (vanished.length > 0) reportVanished(vanished);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession({ status: "guest" }); // session expired
        reset();
      } else {
        setAccountError(messageOf(err));
      }
    } finally {
      polling.current = false;
    }
  }, [reportVanished, reset]);

  // Who is signed in? Retried while the server is unreachable.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const email = await api.getSession();
        if (!cancelled) setSession({ status: "user", email });
      } catch (err) {
        if (cancelled) return;
        setSession({ status: "guest" });
        if (err instanceof ApiError && err.status === 0) timer = setTimeout(check, 5000);
      }
    };

    check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Keep balance + positions fresh while signed in and the tab is visible.
  useEffect(() => {
    if (session.status !== "user") return;

    refresh();
    refreshHistory();

    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [session.status, refresh, refreshHistory]);

  /** Returns true when the trade opened. Failures are reported as a toast. */
  const openPosition = useCallback(
    async (input: OpenTradeInput): Promise<boolean> => {
      try {
        const position = await api.openTrade(input);
        const info = ASSETS[position.asset];

        showToast(
          "success",
          `${position.side === "long" ? "Long" : "Short"} ${position.asset} opened`,
          `${position.leverage}x at ${formatPrice(position.entryPrice, info.precision)}`
        );

        refresh();
        return true;
      } catch (err) {
        showToast("error", "Order not placed", messageOf(err));
        return false;
      }
    },
    [refresh]
  );

  const closePosition = useCallback(
    async (position: Position) => {
      closedHere.current.add(position.orderId);
      setClosing((ids) => new Set(ids).add(position.orderId));

      try {
        const result = await api.closeTrade(position);

        showToast(
          result.pnl >= 0 ? "success" : "info",
          `${position.asset} ${position.side} closed`,
          `Realized PnL ${formatSignedUsd(result.pnl)}`
        );

        setTimeout(refreshHistory, HISTORY_DELAY_MS);
        setTimeout(refreshHistory, HISTORY_RETRY_MS);
      } catch (err) {
        closedHere.current.delete(position.orderId);
        showToast("error", "Position not closed", messageOf(err));
      } finally {
        setClosing((ids) => {
          const next = new Set(ids);
          next.delete(position.orderId);
          return next;
        });
        refresh();
      }
    },
    [refresh, refreshHistory]
  );

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } catch (err) {
      showToast("error", "Could not sign out", messageOf(err));
      return;
    }

    setSession({ status: "guest" });
    reset();
  }, [reset]);

  return {
    session,
    balance,
    positions,
    history,
    closing,
    accountError,
    openPosition,
    closePosition,
    refreshHistory,
    signOut,
  };
}

export type Account = ReturnType<typeof useAccount>;
