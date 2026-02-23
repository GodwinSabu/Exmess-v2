import { describe, test, expect } from "bun:test";
import { calculateLiquidationPrice } from "../liquidation";
import { calculatePnL } from "../pnl";
import  type { Trade } from "../trade";
import { ASSET_CONFIG } from "../../config";
import  type  { Asset } from "../../config";

describe("PnL and Liquidation Tests", () => {

  const asset = "BTC";
  const assetDecimals = ASSET_CONFIG[asset as Asset].decimals;

  const entryPrice = BigInt(50000 * 10 ** assetDecimals);
  const margin = BigInt(100 * 10 ** 2);
  const leverage = 10;

  const liquidationPrice = calculateLiquidationPrice(
    "long",
    entryPrice,
    margin,
    leverage,
    asset
  );

  const trade: Trade = {
    orderId: "1",
    email: "test@test.com",
    asset,
    type: "long",
    margin,
    leverage,
    entryPrice,
    liquidationPrice,
    status: "open"
  };
 
  test("Should calculate profit correctly", () => {
    const priceUp = BigInt(52000 * 10 ** assetDecimals);

    const result = calculatePnL(trade, priceUp);

    expect(result.pnl > 0n).toBe(true);
    expect(result.isLiquidated).toBe(false);
  });

  test("Should calculate full liquidation", () => {
    const priceDown = liquidationPrice;

    const result = calculatePnL(trade, priceDown);

    expect(result.isLiquidated).toBe(true);
    expect(result.pnl).toBe(-margin);
  });

});