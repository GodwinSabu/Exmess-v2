import type { Candle } from "../lib/api";
import { direction, formatAmount, formatPercent, formatPrice } from "../lib/format";

const MAX_ROWS = 200;

const localTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const utcDate = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type Props = {
  candles: Candle[];
  precision: number;
  intraday: boolean;
};

/** The chart's data as a plain table (newest first): readable without hovering. */
export function CandleTable({ candles, precision, intraday }: Props) {
  const rows = candles.slice(-MAX_ROWS).reverse();

  return (
    <div className="chart-table table-wrap">
      <table className="data-table">
        <caption className="sr-only">Most recent {rows.length} candles, newest first</caption>
        <thead>
          <tr>
            <th scope="col">{intraday ? "Time" : "Date (UTC)"}</th>
            <th scope="col">Open</th>
            <th scope="col">High</th>
            <th scope="col">Low</th>
            <th scope="col">Close</th>
            <th scope="col">Change</th>
            <th scope="col">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((candle) => {
            const change = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;
            const date = new Date(candle.time * 1000);

            return (
              <tr key={candle.time}>
                <td>{intraday ? localTime.format(date) : utcDate.format(date)}</td>
                <td>{formatPrice(candle.open, precision)}</td>
                <td>{formatPrice(candle.high, precision)}</td>
                <td>{formatPrice(candle.low, precision)}</td>
                <td>{formatPrice(candle.close, precision)}</td>
                <td className={direction(change)}>{formatPercent(change)}</td>
                <td>{formatAmount(candle.volume, 4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
