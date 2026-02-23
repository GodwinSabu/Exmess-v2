import { USDC_DECIMALS } from "../config";

const wallets = new Map<string, bigint>();

const DEFAULT_BALANCE = BigInt(1000 * 10 ** USDC_DECIMALS);

export function getWallet(email: string): bigint {
  if (!wallets.has(email)) {
    wallets.set(email, DEFAULT_BALANCE);
  }
  return wallets.get(email)!;
}

export function setWallet(email: string, balance: bigint) {
  wallets.set(email, balance);
}

export function debitWallet(email: string, amount: bigint) {
  const balance = getWallet(email);

  if (balance < amount) {
    throw new Error("Insufficient balance");
  }

  wallets.set(email, balance - amount);
}

export function creditWallet(email: string, amount: bigint) {
  const balance = getWallet(email);
  wallets.set(email, balance + amount);
}

export function getAllWallets() {
  return wallets;
}