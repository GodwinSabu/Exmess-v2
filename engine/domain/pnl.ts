import { USDC_DECIMALS, ASSET_CONFIG } from "../config";
import  type { Trade } from "./trade";

export function calculatePnL(
  trade: Trade,
  currentPrice: bigint
) {
  const assetDecimals = ASSET_CONFIG[trade.asset].decimals;

  const entryPriceNormal =
    Number(trade.entryPrice) / 10 ** assetDecimals;

  const currentPriceNormal =
    Number(currentPrice) / 10 ** assetDecimals;

  const marginNormal =
    Number(trade.margin) / 10 ** USDC_DECIMALS;

  const positionSize = marginNormal * trade.leverage;
  const assetAmount = positionSize / entryPriceNormal;

  let pnlNormal = 0;

  if (trade.type === "long") {
    pnlNormal =
      (currentPriceNormal - entryPriceNormal) *
      assetAmount;
  } else {
    pnlNormal =
      (entryPriceNormal - currentPriceNormal) *
      assetAmount;
  }

  const pnl = BigInt(
    Math.round(pnlNormal * 10 ** USDC_DECIMALS)
  );

  const isLiquidated =
    trade.type === "long"
      ? currentPrice <= trade.liquidationPrice
      : currentPrice >= trade.liquidationPrice;

  return {
    pnl: isLiquidated ? -trade.margin : pnl,
    isLiquidated
  };
}