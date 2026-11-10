import { ASSETS } from "../config";
import type { AssetSymbol } from "../config";
import type { Ticker } from "../lib/api";
import { useQuote } from "../lib/priceFeed";
import { liveChange } from "../hooks/useTickers";
import { direction, formatCompact, formatPercent, formatPrice } from "../lib/format";
import { AssetIcon } from "./AssetIcon";

type Props = {
  asset: AssetSymbol;
  ticker: Ticker | undefined;
};

/** Symbol, live price and 24h stats above the chart. */
export function MarketHeader({ asset, ticker }: Props) {
  const info = ASSETS[asset];
  const quote = useQuote(asset);

  const price = quote?.price ?? ticker?.lastPrice;
  const { change, percent } = liveChange(ticker, quote?.price);
  const sign = change === undefined ? "" : change > 0 ? "+" : change < 0 ? "−" : "";
  const tick = quote?.move === 1 ? "up" : quote?.move === -1 ? "down" : "";

  return (
    <section className="panel market-header" aria-label={`${info.name} market`}>
      <div className="market-title">
        <AssetIcon asset={asset} />
        <div>
          <h1>
            {asset}
            <span>/USDC</span>
          </h1>
          <p>{info.name} · Backpack</p>
        </div>
      </div>

      <div className={`market-price ${tick}`} aria-label={`Price ${formatPrice(price, info.precision)}`}>
        {formatPrice(price, info.precision)}
      </div>

      <dl className="market-stats">
        <div>
          <dt>24h change</dt>
          <dd className={direction(change)}>
            {change === undefined
              ? "—"
              : `${sign}${formatPrice(Math.abs(change), info.precision)} (${formatPercent(percent)})`}
          </dd>
        </div>
        <div>
          <dt>24h high</dt>
          <dd>{formatPrice(ticker?.high, info.precision)}</dd>
        </div>
        <div>
          <dt>24h low</dt>
          <dd>{formatPrice(ticker?.low, info.precision)}</dd>
        </div>
        <div>
          <dt>24h volume</dt>
          <dd>
            {formatCompact(ticker?.volume)} {ticker ? asset : ""}
          </dd>
        </div>
        <div>
          <dt>Bid</dt>
          <dd>{formatPrice(quote?.bid, info.precision)}</dd>
        </div>
        <div>
          <dt>Ask</dt>
          <dd>{formatPrice(quote?.ask, info.precision)}</dd>
        </div>
      </dl>
    </section>
  );
}
