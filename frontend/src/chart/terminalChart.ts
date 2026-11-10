import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

/** Mirrors the tokens in styles/base.css (the chart draws on a canvas, not CSS). */
export const CHART_COLORS = {
  surface: "#131722",
  text: "#a3abbd",
  grid: "#1b2030",
  line: "#232838",
  label: "#2e3548",
  up: "#26a69a",
  down: "#ef5350",
  upVolume: "rgba(38, 166, 154, 0.5)",
  downVolume: "rgba(239, 83, 80, 0.5)",
  warn: "#f0b429",
};

export type TerminalChart = {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
};

/**
 * Candles on top, volume in its own pane underneath. Two panes rather than
 * volume overlaid on the price scale: the two measures never share an axis.
 */
export function createTerminalChart(container: HTMLElement): TerminalChart {
  const chart = createChart(container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: CHART_COLORS.surface },
      textColor: CHART_COLORS.text,
      fontSize: 11,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "Trebuchet MS", Roboto, Ubuntu, sans-serif',
      panes: {
        separatorColor: CHART_COLORS.line,
        separatorHoverColor: "rgba(134, 144, 166, 0.2)",
        enableResize: true,
      },
    },
    grid: {
      vertLines: { color: CHART_COLORS.grid },
      horzLines: { color: CHART_COLORS.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { labelBackgroundColor: CHART_COLORS.label },
      horzLine: { labelBackgroundColor: CHART_COLORS.label },
    },
    rightPriceScale: { borderColor: CHART_COLORS.line },
    timeScale: {
      borderColor: CHART_COLORS.line,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
      minBarSpacing: 2,
    },
  });

  const candles = chart.addSeries(CandlestickSeries, {
    upColor: CHART_COLORS.up,
    downColor: CHART_COLORS.down,
    wickUpColor: CHART_COLORS.up,
    wickDownColor: CHART_COLORS.down,
    borderVisible: false,
  });

  const volume = chart.addSeries(
    HistogramSeries,
    {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    },
    1 // second pane
  );

  const [pricePane, volumePane] = chart.panes();
  pricePane?.setStretchFactor(4);
  volumePane?.setStretchFactor(1);

  return { chart, candles, volume };
}

/**
 * lightweight-charts always draws timestamps as UTC. Intraday candles are
 * shifted by the viewer's UTC offset so the axis reads in local time; daily
 * candles stay on their UTC date.
 */
export function toChartTime(utcSeconds: number, intraday: boolean): UTCTimestamp {
  if (!intraday) return utcSeconds as UTCTimestamp;

  const offsetSeconds = new Date(utcSeconds * 1000).getTimezoneOffset() * 60;
  return (utcSeconds - offsetSeconds) as UTCTimestamp;
}
