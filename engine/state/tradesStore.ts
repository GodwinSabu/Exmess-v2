import type { Trade } from "../domain/trade";

const trades = new Map<string, Trade>();

export function saveTrade(trade: Trade) {
  trades.set(trade.orderId, trade);
}

export function getTrade(orderId: string): Trade | undefined {
  return trades.get(orderId);
}

export function getOpenTradesByAsset(asset: string): Trade[] {
  return Array.from(trades.values()).filter(
    (t) => t.asset === asset && t.status === "open"
  );
}

export function getOpenTradesByEmail(email: string): Trade[] {
  return Array.from(trades.values()).filter(
    (t) => t.email === email && t.status === "open"
  );
}

export function closeTrade(orderId: string) {
  const trade = trades.get(orderId);
  if (!trade) throw new Error("Trade not found");

  trade.status = "closed";
  trades.set(orderId, trade);
}

export function getAllTrades() {
  return trades;
}
