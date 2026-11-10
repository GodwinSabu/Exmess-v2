const MINUS = "−"; // real minus sign, same width as "+"
const EMPTY = "—"; // em dash for "no value yet"

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** $1,234.56 */
export function formatUsd(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY;
  return value < 0 ? `${MINUS}${usd.format(-value)}` : usd.format(value);
}

/** +$12.34 / −$12.34 */
export function formatSignedUsd(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY;
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return `${sign}${usd.format(Math.abs(value))}`;
}

/** 74,318.35 */
export function formatPrice(value: number | null | undefined, precision: number): string {
  if (!isNumber(value)) return EMPTY;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/** +1.23% / −1.23% */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return EMPTY;
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** 7.23K / 1.18M */
export function formatCompact(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY;
  return compact.format(value);
}

/** Plain number with up to `digits` decimals: 1.25 */
export function formatAmount(value: number | null | undefined, digits = 4): string {
  if (!isNumber(value)) return EMPTY;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Nov 10, 15:42 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? EMPTY : dateTime.format(date);
}

/** "up" | "down" | "flat" - for colouring a signed value. */
export function direction(value: number | null | undefined): "up" | "down" | "flat" {
  if (!isNumber(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}
