import { getAllWallets } from "../state/walletStore";
import { getAllTrades } from "../state/tradesStore";
import { getAllPrices } from "../state/priceStore";
import { writeFileSync, readFileSync, existsSync } from "fs";
import type { Trade } from "../domain/trade";
import type { Asset } from "../config";
// import type { TradeType } from "../domain/trade";

const SNAPSHOT_FILE = "./engine_snapshot.json";

function serializeBigInt(obj: any): any {
  if (typeof obj === "bigint") {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }

  if (obj && typeof obj === "object") {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = serializeBigInt(obj[key]);
    }
    return newObj;
  }

  return obj;
}

function restoreBigInt(obj: any): any {
  if (typeof obj === "string" && /^\d+$/.test(obj)) {
    return BigInt(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(restoreBigInt);
  }

  if (obj && typeof obj === "object") {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = restoreBigInt(obj[key]);
    }
    return newObj;
  }

  return obj;
}

export function saveSnapshot() {
  const snapshot = {
    wallets: Array.from(getAllWallets().entries()),
    trades: Array.from(getAllTrades().entries()),
    prices: Array.from(getAllPrices().entries())
  };

  const serialized = serializeBigInt(snapshot);

  writeFileSync(SNAPSHOT_FILE, JSON.stringify(serialized, null, 2));

  console.log("✅ Snapshot saved.");
}

export function restoreSnapshot() {
  if (!existsSync(SNAPSHOT_FILE)) {
    console.log("No snapshot found. Starting fresh.");
    return;
  }

  const raw = readFileSync(SNAPSHOT_FILE, "utf-8");
  const parsed = restoreBigInt(JSON.parse(raw));

  const wallets = new Map<string, bigint>(parsed.wallets);
  const trades = new Map<string, Trade>(parsed.trades);
  const prices = new Map<Asset, bigint>(parsed.prices); 

  // Replace state maps
  getAllWallets().clear();
  getAllTrades().clear();
  getAllPrices().clear();

  for (const [k, v] of wallets) {
    getAllWallets().set(k, v);
  }

  for (const [k, v] of trades) {
    getAllTrades().set(k, v);
  }

  for (const [k, v] of prices) {
    getAllPrices().set(k, v);
  }

  console.log("✅ Snapshot restored.");
}