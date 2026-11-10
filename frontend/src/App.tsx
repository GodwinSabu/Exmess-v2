import { useCallback, useEffect, useState } from "react";
import { ASSETS, isAssetSymbol, isIntervalId } from "./config";
import type { AssetSymbol, IntervalId } from "./config";
import { useAccount } from "./hooks/useAccount";
import { useTickers } from "./hooks/useTickers";
import { subscribeQuote } from "./lib/priceFeed";
import { formatPrice } from "./lib/format";
import { TopBar } from "./components/TopBar";
import { MarketHeader } from "./components/MarketHeader";
import { ChartPanel } from "./components/ChartPanel";
import { PositionsPanel } from "./components/PositionsPanel";
import { Watchlist } from "./components/Watchlist";
import { OrderPanel } from "./components/OrderPanel";
import { AuthDialog } from "./components/AuthDialog";
import { Toasts } from "./components/Toasts";

const BASE_TITLE = "Superapp — Trade";

/** Remember a small per-browser preference. Storage can be blocked: never rely on it. */
function readStored<T extends string>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the choice just won't be remembered.
  }
}

/** Live price in the browser tab, like a trading terminal. Updated once a second at most. */
function useLivePriceTitle(asset: AssetSymbol) {
  useEffect(() => {
    let lastUpdate = 0;

    const unsubscribe = subscribeQuote(asset, (quote) => {
      const now = Date.now();
      if (now - lastUpdate < 1000) return;
      lastUpdate = now;
      document.title = `${formatPrice(quote.price, ASSETS[asset].precision)} ${asset}/USDC — Superapp`;
    });

    return () => {
      unsubscribe();
      document.title = BASE_TITLE;
    };
  }, [asset]);
}

export function App() {
  const account = useAccount();
  const tickers = useTickers();

  const [asset, setAsset] = useState<AssetSymbol>(() => readStored("superapp.asset", isAssetSymbol, "BTC"));
  const [interval, setChartInterval] = useState<IntervalId>(() =>
    readStored("superapp.interval", isIntervalId, "1m")
  );
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => writeStored("superapp.asset", asset), [asset]);
  useEffect(() => writeStored("superapp.interval", interval), [interval]);

  useLivePriceTitle(asset);

  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const signedIn = account.session.status === "user";

  return (
    <div className="app">
      <TopBar
        session={account.session}
        balance={account.balance}
        positions={account.positions}
        onSignIn={openAuth}
        onSignOut={account.signOut}
      />

      {signedIn && account.accountError && (
        <div className="banner" role="status">
          <span aria-hidden="true">{"⚠"}</span>
          Balance and positions may be out of date. {account.accountError}
        </div>
      )}

      <main className="workspace">
        <div className="main-col">
          <MarketHeader asset={asset} ticker={tickers[asset]} />
          <ChartPanel
            asset={asset}
            interval={interval}
            onIntervalChange={setChartInterval}
            positions={account.positions}
          />
          <PositionsPanel
            session={account.session}
            positions={account.positions}
            history={account.history}
            closing={account.closing}
            onClose={account.closePosition}
            onSelectAsset={setAsset}
            onShowHistory={account.refreshHistory}
            onSignIn={openAuth}
          />
        </div>

        <div className="side-col">
          <Watchlist selected={asset} tickers={tickers} onSelect={setAsset} />
          <OrderPanel
            asset={asset}
            session={account.session}
            balance={account.balance}
            onSubmit={account.openPosition}
            onSignIn={openAuth}
          />
        </div>
      </main>

      <AuthDialog open={authOpen && !signedIn} onClose={closeAuth} />
      <Toasts />
    </div>
  );
}
