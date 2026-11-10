import { ASSET_LIST } from "../config";
import type { AssetInfo, AssetSymbol } from "../config";
import type { Ticker } from "../lib/api";
import { useQuote } from "../lib/priceFeed";
import { liveChange } from "../hooks/useTickers";
import type { Tickers } from "../hooks/useTickers";
import { direction, formatPercent, formatPrice } from "../lib/format";
import { AssetIcon } from "./AssetIcon";

type RowProps = {
  info: AssetInfo;
  ticker: Ticker | undefined;
  selected: boolean;
  onSelect: (asset: AssetSymbol) => void;
};

function WatchRow({ info, ticker, selected, onSelect }: RowProps) {
  const quote = useQuote(info.symbol);
  const price = quote?.price ?? ticker?.lastPrice;
  const { percent } = liveChange(ticker, quote?.price);

  return (
    <li>
      <button
        type="button"
        className="watch-row"
        aria-pressed={selected}
        onClick={() => onSelect(info.symbol)}
      >
        <span className="watch-asset">
          <AssetIcon asset={info.symbol} small />
          <span>
            <strong>{info.symbol}</strong>
            <small>{info.name}</small>
          </span>
        </span>
        <span className="watch-price">{formatPrice(price, info.precision)}</span>
        <span className={`watch-change ${direction(percent)}`}>{formatPercent(percent)}</span>
      </button>
    </li>
  );
}

type Props = {
  selected: AssetSymbol;
  tickers: Tickers;
  onSelect: (asset: AssetSymbol) => void;
};

/** The tradable markets with live price and 24h change. */
export function Watchlist({ selected, tickers, onSelect }: Props) {
  return (
    <section className="panel watchlist" aria-label="Markets">
      <h2 className="panel-title">Markets</h2>
      <ul>
        {ASSET_LIST.map((info) => (
          <WatchRow
            key={info.symbol}
            info={info}
            ticker={tickers[info.symbol]}
            selected={info.symbol === selected}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  );
}
