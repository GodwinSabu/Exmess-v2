export const USDC_DECIMALS =2 
 
export const ASSET_CONFIG = {
    BTC: { decimals :4  },
    ETH: { decimals :6  },
    SOL: { decimals :6  },
    USD: { decimals: 6  } 
} as const; 

export type Asset = keyof typeof ASSET_CONFIG;

// A trade only executes against a price refreshed within this window.
// Prices restored from a snapshot, or left over after the poller dies,
// are too old to trade on.
export const PRICE_MAX_AGE_MS = 10_000;

// API requests that sat in the stream longer than this are rejected instead
// of executed late (the server has already told the user it timed out).
export const REQUEST_TTL_MS = 5_000;
