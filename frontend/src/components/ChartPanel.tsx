import { useEffect, useRef, useState } from "react";
import { LineStyle } from "lightweight-charts";
import type { CandlestickData, HistogramData, MouseEventParams } from "lightweight-charts";
import { ASSETS, INTERVALS } from "../config";
import type { AssetSymbol, IntervalId } from "../config";
import { getCandles } from "../lib/api";
import type { Candle, Position } from "../lib/api";
import { getQuote, subscribeQuote } from "../lib/priceFeed";
import { direction, formatCompact, formatPercent, formatPrice } from "../lib/format";
import { CHART_COLORS, createTerminalChart, toChartTime } from "../chart/terminalChart";
import type { TerminalChart } from "../chart/terminalChart";
import { CandleTable } from "./CandleTable";

// Bars in view after loading (the rest is there to scroll back through).
const VISIBLE_BARS = 140;

// Live candles are built from our mid-price ticks; history comes from the
// exchange's trade-based candles. Re-sync with the exchange this often.
const RESYNC_MS = 30_000;

// When the first load fails (typically the API is still starting), try again this often.
const RETRY_MS = 4_000;

type LoadState = "loading" | "ready" | "error";

/**
 * Fold a live price into the newest candle, or start the next candle when the
 * interval has rolled over. Returns true when a candle was added.
 */
function applyPrice(candles: Candle[], price: number, seconds: number): boolean {
  const last = candles[candles.length - 1];
  if (!last) return false;

  const bucket = Math.floor(Date.now() / 1000 / seconds) * seconds;

  if (bucket > last.time) {
    candles.push({
      time: bucket,
      open: last.close,
      high: Math.max(last.close, price),
      low: Math.min(last.close, price),
      close: price,
      volume: 0,
    });
    return true;
  }

  last.close = price;
  if (price > last.high) last.high = price;
  if (price < last.low) last.low = price;
  return false;
}

const toCandleData = (candle: Candle, intraday: boolean): CandlestickData => ({
  time: toChartTime(candle.time, intraday),
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
});

const toVolumeData = (candle: Candle, intraday: boolean): HistogramData => ({
  time: toChartTime(candle.time, intraday),
  value: candle.volume,
  color: candle.close >= candle.open ? CHART_COLORS.upVolume : CHART_COLORS.downVolume,
});

type Props = {
  asset: AssetSymbol;
  interval: IntervalId;
  onIntervalChange: (interval: IntervalId) => void;
  /** Open positions; the ones on this asset are drawn as entry / liquidation lines. */
  positions: Position[];
};

export function ChartPanel({ asset, interval, onIntervalChange, positions }: Props) {
  const info = ASSETS[asset];
  const intervalInfo = INTERVALS.find((item) => item.id === interval) ?? INTERVALS[0];
  const seconds = intervalInfo.seconds;
  const intraday = seconds < 86_400;

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<TerminalChart | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  const [view, setView] = useState<"chart" | "table">("chart");
  const [load, setLoad] = useState<LoadState>("loading");
  const [rows, setRows] = useState<Candle[]>([]); // snapshot for the table view
  const [last, setLast] = useState<Candle | null>(null); // newest candle, live
  const [hover, setHover] = useState<Candle | null>(null); // candle under the crosshair
  const [attempt, setAttempt] = useState(0);

  // Create the chart once. Declared first so it is also torn down first.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = createTerminalChart(container);
    chartRef.current = terminal;

    const onCrosshairMove = (param: MouseEventParams) => {
      // The series types are known here: candles hold OHLC, volume holds a value.
      const bar =
        param.time === undefined
          ? undefined
          : (param.seriesData.get(terminal.candles) as CandlestickData | undefined);

      if (!bar) {
        setHover(null);
        return;
      }

      const volume = param.seriesData.get(terminal.volume) as HistogramData | undefined;

      setHover({
        time: Number(param.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: volume?.value ?? 0,
      });
    };

    terminal.chart.subscribeCrosshairMove(onCrosshairMove);

    return () => {
      chartRef.current = null;
      terminal.chart.unsubscribeCrosshairMove(onCrosshairMove);
      terminal.chart.remove();
    };
  }, []);

  // Load candle history for the asset + interval, then keep the newest candle live.
  useEffect(() => {
    const terminal = chartRef.current;
    if (!terminal) return;

    const controller = new AbortController();
    let cancelled = false;

    // Until the new history arrives, ticks have nothing valid to update.
    candlesRef.current = [];
    setLoad("loading");
    setHover(null);

    terminal.candles.applyOptions({
      priceFormat: { type: "price", precision: info.precision, minMove: 1 / 10 ** info.precision },
    });

    const paint = (candles: Candle[], reframe: boolean) => {
      const quote = getQuote(asset);
      if (quote) applyPrice(candles, quote.price, seconds);

      candlesRef.current = candles;

      terminal.candles.setData(candles.map((candle) => toCandleData(candle, intraday)));
      terminal.volume.setData(candles.map((candle) => toVolumeData(candle, intraday)));

      if (reframe) {
        terminal.chart.timeScale().setVisibleLogicalRange({
          from: Math.max(candles.length - VISIBLE_BARS, 0),
          to: candles.length + 5,
        });
      }

      setRows(candles.slice());
      setLast(candles[candles.length - 1] ?? null);
    };

    let retry: ReturnType<typeof setTimeout> | undefined;

    const fetchCandles = async (initial: boolean) => {
      try {
        const candles = await getCandles(asset, interval, controller.signal);
        if (cancelled) return;

        paint(candles, initial);
        setLoad("ready");
      } catch {
        // A failed background re-sync is harmless: the chart keeps what it has.
        if (cancelled || !initial) return;

        setLoad("error");
        retry = setTimeout(() => fetchCandles(true), RETRY_MS);
      }
    };

    fetchCandles(true);

    const resync = setInterval(() => {
      if (document.visibilityState === "visible" && candlesRef.current.length > 0) fetchCandles(false);
    }, RESYNC_MS);

    const unsubscribe = subscribeQuote(asset, (quote) => {
      const candles = candlesRef.current;
      if (candles.length === 0) return;

      const added = applyPrice(candles, quote.price, seconds);
      const newest = candles[candles.length - 1]!;

      terminal.candles.update(toCandleData(newest, intraday));

      if (added) {
        terminal.volume.update(toVolumeData(newest, intraday));
        setRows(candles.slice());
      }

      setLast({ ...newest });
    });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(retry);
      clearInterval(resync);
      unsubscribe();
    };
  }, [asset, interval, attempt, seconds, intraday, info.precision]);

  // Entry + liquidation lines for open positions on this asset.
  const lines = positions.filter((position) => position.asset === asset);
  const linesKey = lines
    .map((p) => `${p.orderId}:${p.side}:${p.leverage}:${p.entryPrice}:${p.liquidationPrice}`)
    .join("|");

  useEffect(() => {
    const terminal = chartRef.current;
    if (!terminal || lines.length === 0) return;

    const created = lines.flatMap((position) => [
      terminal.candles.createPriceLine({
        price: position.entryPrice,
        color: position.side === "long" ? CHART_COLORS.up : CHART_COLORS.down,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `${position.side === "long" ? "Long" : "Short"} ${position.leverage}x`,
      }),
      terminal.candles.createPriceLine({
        price: position.liquidationPrice,
        color: CHART_COLORS.warn,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Liq.",
      }),
    ]);

    return () => {
      if (chartRef.current !== terminal) return; // chart already destroyed
      for (const line of created) terminal.candles.removePriceLine(line);
    };
    // `lines` is derived from linesKey, which changes exactly when the lines do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  const shown = hover ?? last;
  const change = shown ? shown.close - shown.open : 0;
  const changePercent = shown && shown.open > 0 ? (change / shown.open) * 100 : 0;
  const tone = direction(change) === "down" ? "down" : "up";
  const tableRows = last && rows.length > 0 ? [...rows.slice(0, -1), last] : rows;

  return (
    <section className="panel chart-panel" aria-label={`${asset} price chart`}>
      <div className="chart-toolbar">
        <div className="segmented" role="group" aria-label="Candle interval">
          {INTERVALS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="seg"
              aria-pressed={item.id === interval}
              onClick={() => onIntervalChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="toolbar-spacer" />

        <div className="segmented" role="group" aria-label="View">
          <button type="button" className="seg" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
            Chart
          </button>
          <button type="button" className="seg" aria-pressed={view === "table"} onClick={() => setView("table")}>
            Table
          </button>
        </div>
      </div>

      <div className="chart-body" data-busy={load === "loading"}>
        {view === "chart" && shown && (
          <div className="chart-legend">
            <span className="pair">
              {asset}/USDC · {intervalInfo.label}
            </span>
            <span className="ohlc">
              <span>
                O <b className={tone}>{formatPrice(shown.open, info.precision)}</b>
              </span>
              <span>
                H <b className={tone}>{formatPrice(shown.high, info.precision)}</b>
              </span>
              <span>
                L <b className={tone}>{formatPrice(shown.low, info.precision)}</b>
              </span>
              <span>
                C <b className={tone}>{formatPrice(shown.close, info.precision)}</b>
              </span>
              <b className={tone}>{formatPercent(changePercent)}</b>
              <span>
                Vol <b>{formatCompact(shown.volume)}</b>
              </span>
            </span>
          </div>
        )}

        {/* Stays mounted behind the table view so the chart keeps its state. */}
        <div
          ref={containerRef}
          className="chart-canvas"
          style={{ visibility: view === "chart" ? "visible" : "hidden" }}
        />

        {view === "table" && <CandleTable candles={tableRows} precision={info.precision} intraday={intraday} />}

        {load === "loading" && (
          <div className="chart-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <span className="sr-only">Loading candles</span>
          </div>
        )}

        {load === "error" && (
          <div className="chart-state solid" role="alert">
            <strong>Couldn't load the chart</strong>
            <span>The candle history for {asset} didn't come back from the server. Retrying automatically.</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {load === "ready" && rows.length === 0 && (
          <div className="chart-state solid">
            <strong>No candles yet</strong>
            <span>The exchange has no {intervalInfo.label} history for {asset}.</span>
          </div>
        )}
      </div>
    </section>
  );
}
