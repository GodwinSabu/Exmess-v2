// import { processEvent } from "./events/processor";
// import { setPrice } from "./state/priceStore";
// import { getWallet } from "./state/walletStore";
// import { USDC_DECIMALS, ASSET_CONFIG } from "./config";

// const asset = "BTC";
// const decimals = ASSET_CONFIG[asset].decimals;

// setPrice(asset, BigInt(50000 * 10 ** decimals));

// processEvent({
//   type: "OPEN_TRADE",
//   payload: {
//     orderId: "1",
//     email: "johnss@test.com",
//     asset,
//     tradeType: "long",
//     margin: BigInt(100 * 10 ** USDC_DECIMALS),
//     leverage: 10
//   }
// });

// processEvent({
//   type: "PRICE_UPDATE",
//   payload: {
//     asset,
//     price: BigInt(52000 * 10 ** decimals)
//   }
// });

// processEvent({
//   type: "CLOSE_TRADE",
//   payload: {
//     orderId: "1"
//   }
// });

// console.log("Final Wallet:", getWallet("john@test.com").toString());

// import { restoreSnapshot, saveSnapshot } from "./snapshot/snapshotService";
// import { getAllWallets } from "./state/walletStore";
// import { getAllPrices } from "./state/priceStore";

// restoreSnapshot();

// // Simulate engine activity
// // getAllWallets().set("u1", 10000n);
// getAllWallets().set("u2", 5000n);
// getAllPrices().set("ETH", 5000000000n);

// console.log("Current wallets:", getAllWallets());
// console.log("Current prices:", getAllPrices());

// saveSnapshot();

// // import { restoreSnapshot, saveSnapshot } from "./snapshot/snapshotService";
// import { startRedisConsumer } from "./infra/redisConsumer";

// restoreSnapshot();

// startRedisConsumer();

// setInterval(() => {
//   saveSnapshot();
// }, 10000);

import { restoreSnapshot, saveSnapshot } from "./snapshot/snapshotService";
import { startRedisConsumer } from "./infra/redisConsumer";
import { getAllWallets } from "./state/walletStore";
import { getAllPrices } from "./state/priceStore";

/* ===========================
   BOOTSTRAP ENGINE
=========================== */

async function bootstrap() {
  console.log("🚀 Starting Engine...");

  // Restore previous state
  restoreSnapshot();

  console.log("📦 Snapshot restored");

  // (Optional) Seed test data
  if (!getAllWallets().has("john@test.com")) {
    getAllWallets().set("john@test.com", 10000000000n);
  }

  if (!getAllPrices().has("BTC")) {
    getAllPrices().set("BTC", 5000000000n);
  }

  console.log("💰 Wallets:", getAllWallets());
  console.log("📈 Prices:", getAllPrices());

  // Start Redis Stream consumer
  await startRedisConsumer();

  // Auto-save snapshot every 10s
  setInterval(() => {
    saveSnapshot();
    console.log("💾 Snapshot saved");
  }, 10000);
}

bootstrap();