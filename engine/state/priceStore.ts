import  type { Asset } from "../config";
import { PRICE_MAX_AGE_MS } from "../config";

const prices = new Map<Asset, bigint>();

// When each price was last refreshed by the live feed (ms epoch).
// Prices restored from a snapshot have no entry, so they count as stale.
const updatedAt = new Map<Asset, number>();

export function setPrice(asset: Asset, price: bigint, ts: number = Date.now()) {
  prices.set(asset, price);
  updatedAt.set(asset, Math.min(ts, Date.now()));
}

export function getPrice(asset: Asset): bigint {
  const price = prices.get(asset);

  if (!price) {
    throw new Error(`Price not available for ${asset}`);
  }

  return price;
}

/** Price to execute a trade at: must exist AND be recent. */
export function getFreshPrice(asset: Asset): bigint {
  const price = getPrice(asset);
  const ts = updatedAt.get(asset);

  if (ts === undefined || Date.now() - ts > PRICE_MAX_AGE_MS) {
    throw new Error(`Price feed is stale for ${asset}`);
  }

  return price;
}

export function getAllPrices() {
  return prices;
}
