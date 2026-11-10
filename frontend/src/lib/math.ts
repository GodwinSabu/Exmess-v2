import type { Side } from "./api";

/**
 * Mirrors the engine's maths (engine/domain/pnl.ts, liquidation.ts) so the UI
 * can show live PnL between server polls. The engine stays the source of truth.
 */

/** Notional position size in USDC. */
export const positionSize = (margin: number, leverage: number) => margin * leverage;

/** Unrealized profit or loss in USDC at the given mark price. */
export function unrealizedPnl(
  side: Side,
  margin: number,
  leverage: number,
  entryPrice: number,
  markPrice: number
): number {
  if (!(entryPrice > 0)) return 0;

  const quantity = positionSize(margin, leverage) / entryPrice;
  const move = side === "long" ? markPrice - entryPrice : entryPrice - markPrice;

  // A position can never lose more than its margin: it is liquidated first.
  return Math.max(move * quantity, -margin);
}

/** Price at which the whole margin is lost. */
export function liquidationPrice(side: Side, entryPrice: number, leverage: number): number {
  const distance = entryPrice / leverage;
  return side === "long" ? entryPrice - distance : entryPrice + distance;
}
