import { useFeedStatus, useQuotes } from "../lib/priceFeed";
import type { FeedStatus } from "../lib/priceFeed";
import { unrealizedPnl } from "../lib/math";
import { direction, formatSignedUsd, formatUsd } from "../lib/format";
import type { Position } from "../lib/api";
import type { Session } from "../hooks/useAccount";

const FEED_LABEL: Record<FeedStatus, { label: string; hint: string }> = {
  connecting: { label: "Connecting", hint: "Connecting to the price feed." },
  live: { label: "Live", hint: "Prices are streaming live." },
  stale: { label: "Prices paused", hint: "Connected, but the price poller has stopped sending prices." },
  offline: { label: "Offline", hint: "Can't reach the API server. Retrying." },
};

function FeedBadge() {
  const status = useFeedStatus();
  const { label, hint } = FEED_LABEL[status];

  return (
    <span className="feed-badge" data-status={status} title={hint} role="status">
      <span className="feed-dot" aria-hidden="true" />
      <span className="feed-label">{label}</span>
      <span className="sr-only">{hint}</span>
    </span>
  );
}

/** Equity = free balance + margin locked in positions + their live PnL. */
function AccountStats({ balance, positions }: { balance: number | null; positions: Position[] }) {
  const quotes = useQuotes();

  let locked = 0;
  let pnl = 0;

  for (const position of positions) {
    locked += position.margin;
    const mark = quotes[position.asset]?.price;
    if (mark !== undefined) {
      pnl += unrealizedPnl(position.side, position.margin, position.leverage, position.entryPrice, mark);
    }
  }

  const equity = balance === null ? null : balance + locked + pnl;

  return (
    <dl className="account-stats">
      <div>
        <dt>Equity</dt>
        <dd>{formatUsd(equity)}</dd>
      </div>
      <div>
        <dt>Available</dt>
        <dd>{formatUsd(balance)}</dd>
      </div>
      <div className="optional">
        <dt>Unrealized PnL</dt>
        <dd className={direction(pnl)}>{positions.length > 0 ? formatSignedUsd(pnl) : formatUsd(0)}</dd>
      </div>
    </dl>
  );
}

function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#2f6bea" />
      <path d="M10 6v4m0 10v6m12-20v6m0 8v6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="7" y="10" width="6" height="10" rx="1.5" fill="#fff" />
      <rect x="19" y="12" width="6" height="8" rx="1.5" fill="#fff" />
    </svg>
  );
}

type Props = {
  session: Session;
  balance: number | null;
  positions: Position[];
  onSignIn: () => void;
  onSignOut: () => void;
};

export function TopBar({ session, balance, positions, onSignIn, onSignOut }: Props) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Superapp home">
        <BrandMark />
        <span>superapp</span>
      </a>

      <FeedBadge />

      <div className="topbar-spacer" />

      {session.status === "user" && (
        <>
          <AccountStats balance={balance} positions={positions} />
          <div className="user">
            <span className="user-email" title={session.email}>
              {session.email}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </>
      )}

      {session.status === "guest" && (
        <button type="button" className="btn btn-primary" onClick={onSignIn}>
          Sign in
        </button>
      )}
    </header>
  );
}
