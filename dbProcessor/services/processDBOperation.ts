import { prisma } from "@superapp/db";

export async function processDBOperation(operation: string, data: any) {
  switch (operation) {

    case "CREATE_TRADE": {
console.log("Creating trade:", data);
      const user = await prisma.user.upsert({
        where: { email: data.email },
        update: {},
        create: { email: data.email }
      });

      // The engine identifies assets by symbol ("BTC"); Trade.assetId is the
      // Asset row's numeric id, so resolve (or create) that row first.
      const symbol = String(data.asset ?? data.assetId);

      const asset = await prisma.asset.upsert({
        where: { symbol },
        update: {},
        create: { symbol }
      });

      // Engine sends "long" / "short"; the DB enum is LONG / SHORT.
      const tradeType = String(data.tradeType).toUpperCase() === "SHORT" ? "SHORT" : "LONG";

      await prisma.trade.create({
        data: { 
          orderId: data.orderId,
          openPrice: data.openPrice,
          leverage: data.leverage,
          liquidated: data.liquidated,
          tradeType,
          userId: user.id,
          assetId: asset.id
        }
      });

      console.log("Trade saved:", data.orderId);
      break;
    }

    case "UPDATE_TRADE": {

      await prisma.trade.update({
        where: { orderId: data.orderId },
        data: {
          closePrice: data.closePrice,
          pnl: data.pnl,
          liquidated: data.liquidated
        }
      });

      console.log("Trade closed:", data.orderId);
      break;
    }

    default:
      console.warn("Unknown DB operation:", operation);
  }
}
