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

      await prisma.trade.create({
        data: { 
          orderId: data.orderId,
          openPrice: data.openPrice,
          leverage: data.leverage,
          liquidated: data.liquidated,
          tradeType: data.tradeType,
          userId: user.id,
          assetId: data.assetId
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

     
      break;
    }

    default:
      console.warn("Unknown DB operation:", operation);
  }
}