import type { AssetSymbol } from "../config";

/** Neutral monogram chip for an asset (no third-party logos). */
export function AssetIcon({ asset, small = false }: { asset: AssetSymbol; small?: boolean }) {
  return (
    <span className={small ? "asset-icon sm" : "asset-icon"} aria-hidden="true">
      {asset.slice(0, 1)}
    </span>
  );
}
