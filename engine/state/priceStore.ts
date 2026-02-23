import  type { Asset } from "../config";

const prices = new Map<Asset, bigint>();

export function setPrice(asset: Asset, price: bigint) {
  prices.set(asset, price);
}

export function getPrice(asset: Asset): bigint {
  const price = prices.get(asset);

  if (!price) {
    throw new Error(`Price not available for ${asset}`);
  }

  return price;
}

export function getAllPrices() {
  return prices;
}