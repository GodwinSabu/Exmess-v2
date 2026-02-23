import { USDC_DECIMALS, ASSET_CONFIG } from "../config";
import type { TradeType } from "./trade";

export function calculateLiquidationPrice(
  type: TradeType,
  entryPrice: bigint,
  margin: bigint,
  leverage: number,
  asset: keyof typeof ASSET_CONFIG
): bigint {

  const assetDecimals = ASSET_CONFIG[asset].decimals;

  const entryPriceNormal =
    Number(entryPrice) / 10 ** assetDecimals;

  const marginNormal =
    Number(margin) / 10 ** USDC_DECIMALS;

  const positionSize = marginNormal * leverage;
  const assetAmount = positionSize / entryPriceNormal;

  let liquidationPrice: number;

  if (type === "long") {
    liquidationPrice =
      entryPriceNormal - marginNormal / assetAmount;
  } else {
    liquidationPrice =
      entryPriceNormal + marginNormal / assetAmount;
  }

  return BigInt(
    Math.round(liquidationPrice * 10 ** assetDecimals)
  );
}