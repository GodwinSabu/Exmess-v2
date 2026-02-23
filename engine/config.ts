export const USDC_DECIMALS =2 
 
export const ASSET_CONFIG = {
    BTC: { decimals :4  },
    ETH: { decimals :6  },
    USD: { decimals: 6  } 
} as const; 

export type Asset = keyof typeof ASSET_CONFIG;
