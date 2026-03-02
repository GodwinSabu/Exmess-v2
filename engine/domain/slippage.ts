export function validateSlippage(
    expectedPrice: bigint,
    currentPrice: bigint,
    slippageBps: number
  ) {
    if (slippageBps < 0) {
      throw new Error("Invalid slippage value");
    }
  
    const diff =
      currentPrice > expectedPrice
        ? currentPrice - expectedPrice
        : expectedPrice - currentPrice;
  
    const allowed =
      (expectedPrice * BigInt(slippageBps)) / BigInt(10000);
  
    if (diff > allowed) {
      throw new Error("Slippage exceeded");
    }
  }