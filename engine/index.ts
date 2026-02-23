import { processEvent } from "./events/processor";
import { setPrice } from "./state/priceStore";
import { getWallet } from "./state/walletStore";
import { USDC_DECIMALS, ASSET_CONFIG } from "./config";

const asset = "BTC";
const decimals = ASSET_CONFIG[asset].decimals;

setPrice(asset, BigInt(50000 * 10 ** decimals));

processEvent({
  type: "OPEN_TRADE",
  payload: {
    orderId: "1",
    email: "johnss@test.com",
    asset,
    tradeType: "long",
    margin: BigInt(100 * 10 ** USDC_DECIMALS),
    leverage: 10
  }
});

processEvent({
  type: "PRICE_UPDATE",
  payload: {
    asset,
    price: BigInt(52000 * 10 ** decimals)
  }
});

processEvent({
  type: "CLOSE_TRADE",
  payload: {
    orderId: "1"
  }
});

console.log("Final Wallet:", getWallet("john@test.com").toString());