import { useState } from "react";
import type { ReactNode } from "react";
import { ASSETS } from "../config";
import type { AssetSymbol } from "../config";
import type { ClosedTrade, Position } from "../lib/api";
import { useQuotes } from "../lib/priceFeed";
import { positionSize, unrealizedPnl } from "../lib/math";
import {
  direction,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatSignedUsd,
  formatUsd,
} from "../lib/format";
import type { Session } from "../hooks/useAccount";
import { AssetIcon } from "./AssetIcon";

type Tab = "positions" | "history";

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

function SideTag({ side, leverage }: { side: Position["side"]; leverage: number }) {
  return (
    <span className={`side-tag ${side === "long" ? "up" : "down"}`}>
      {side === "long" ? "Long" : "Short"}
      <span className="lev">{leverage}x</span>
    </span>
  );
}

function MarketCell({ asset, onSelect }: { asset: AssetSymbol; onSelect: (asset: AssetSymbol) => void }) {
  return (
    <button type="button" className="symbol-link" onClick={() => onSelect(asset)} title={`Show ${asset} chart`}>
      <AssetIcon asset={asset} small />
      {asset}/USDC
    </button>
  );
}

type OpenProps = {
  positions: Position[];
  closing: ReadonlySet<string>;
  onClose: (position: Position) => void;
  onSelectAsset: (asset: AssetSymbol) => void;
};

/** Open positions with PnL recomputed from the live price on every tick. */
function OpenPositions({ positions, closing, onClose, onSelectAsset }: OpenProps) {
  const quotes = useQuotes();

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col">Side</th>
            <th scope="col">Size</th>
            <th scope="col">Margin</th>
            <th scope="col">Entry</th>
            <th scope="col">Mark</th>
            <th scope="col">Liq. price</th>
            <th scope="col">PnL (ROE)</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const { precision } = ASSETS[position.asset];
            const mark = quotes[position.asset]?.price;
            const pnl =
              mark === undefined
                ? undefined
                : unrealizedPnl(position.side, position.margin, position.leverage, position.entryPrice, mark);
            const roe = pnl === undefined ? undefined : (pnl / position.margin) * 100;
            const busy = closing.has(position.orderId);

            return (
              <tr key={position.orderId}>
                <td>
                  <MarketCell asset={position.asset} onSelect={onSelectAsset} />
                </td>
                <td>
                  <SideTag side={position.side} leverage={position.leverage} />
                </td>
                <td>{formatUsd(positionSize(position.margin, position.leverage))}</td>
                <td>{formatUsd(position.margin)}</td>
                <td>{formatPrice(position.entryPrice, precision)}</td>
                <td>{formatPrice(mark, precision)}</td>
                <td>{formatPrice(position.liquidationPrice, precision)}</td>
                <td className={`pnl ${direction(pnl)}`}>
                  {formatSignedUsd(pnl)}
                  <small>{formatPercent(roe)}</small>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => onClose(position)}
                    aria-label={`Close ${position.asset} ${position.side} position`}
                  >
                    {busy ? "Closing…" : "Close"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function History({ trades, onSelectAsset }: { trades: ClosedTrade[]; onSelectAsset: (asset: AssetSymbol) => void }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col">Side</th>
            <th scope="col">Entry</th>
            <th scope="col">Exit</th>
            <th scope="col">Realized PnL</th>
            <th scope="col">Result</th>
            <th scope="col">Opened</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const { precision } = ASSETS[trade.asset];

            return (
              <tr key={trade.orderId}>
                <td>
                  <MarketCell asset={trade.asset} onSelect={onSelectAsset} />
                </td>
                <td>
                  <SideTag side={trade.side} leverage={trade.leverage} />
                </td>
                <td>{formatPrice(trade.openPrice, precision)}</td>
                <td>{formatPrice(trade.closePrice, precision)}</td>
                <td className={direction(trade.pnl)}>{formatSignedUsd(trade.pnl)}</td>
                <td>
                  {trade.liquidated ? (
                    <span className="badge liquidated">Liquidated</span>
                  ) : (
                    <span className="badge">Closed</span>
                  )}
                </td>
                <td>{formatDateTime(trade.openedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  session: Session;
  positions: Position[];
  history: ClosedTrade[];
  closing: ReadonlySet<string>;
  onClose: (position: Position) => void;
  onSelectAsset: (asset: AssetSymbol) => void;
  /** Called when the History tab is opened, to load the latest closed trades. */
  onShowHistory: () => void;
  onSignIn: () => void;
};

/** Bottom panel: open positions and closed-trade history. */
export function PositionsPanel({
  session,
  positions,
  history,
  closing,
  onClose,
  onSelectAsset,
  onShowHistory,
  onSignIn,
}: Props) {
  const [tab, setTab] = useState<Tab>("positions");

  let body: ReactNode;

  if (session.status === "loading") {
    body = <Empty title="Loading your account…" />;
  } else if (session.status === "guest") {
    body = (
      <Empty title="Sign in to trade">
        <span>Your positions and trade history will show up here.</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSignIn}>
          Sign in
        </button>
      </Empty>
    );
  } else if (tab === "positions") {
    body =
      positions.length === 0 ? (
        <Empty title="No open positions">
          <span>Pick a market, set your margin and leverage, then go long or short.</span>
        </Empty>
      ) : (
        <OpenPositions positions={positions} closing={closing} onClose={onClose} onSelectAsset={onSelectAsset} />
      );
  } else {
    body =
      history.length === 0 ? (
        <Empty title="No closed trades yet">
          <span>Trades you close, and any that get liquidated, are listed here.</span>
        </Empty>
      ) : (
        <History trades={history} onSelectAsset={onSelectAsset} />
      );
  }

  return (
    <section className="panel positions" aria-label="Positions and history">
      <div className="tabs" role="tablist" aria-label="Account">
        <button
          type="button"
          role="tab"
          id="tab-positions"
          className="tab"
          aria-selected={tab === "positions"}
          aria-controls="account-panel"
          onClick={() => setTab("positions")}
        >
          Positions
          <span className="count">{positions.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-history"
          className="tab"
          aria-selected={tab === "history"}
          aria-controls="account-panel"
          onClick={() => {
            setTab("history");
            onShowHistory();
          }}
        >
          History
        </button>
      </div>

      <div id="account-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ minHeight: 0 }}>
        {body}
      </div>
    </section>
  );
}
