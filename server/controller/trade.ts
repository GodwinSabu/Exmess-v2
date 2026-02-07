import { jsonResponse } from "../utills/jsonResponse";

interface CreateTradeRequest {
    asset: 'SOL' | 'ETH' | 'BTC';
    type: 'long' | 'short';
    margin: number;
    leverage: number;
    slippage: number;
  }


export const createTrade = async (req: Request): Promise<Response> => {
  try {
    // logic
    const email = (req as any).user?.email;
        if (!email) {
            return jsonResponse({
                success: false,
                message: "Unauthorized Access"
            }, 401);
        }

        const tradeData: CreateTradeRequest = await req.json() as CreateTradeRequest;

        if (tradeData.margin <= 99) {
            return jsonResponse({
                success: false,
                message: "Margin must be greater than 0.99"
            }, 400);
        }

        if (!['SOL', 'ETH', 'BTC'].includes(tradeData.asset)) {
            return jsonResponse({
                success: false,
                message: "Invalid asset. Supported assets are SOL, ETH, BTC"
            }, 400);
        }

        if (!['long', 'short'].includes(tradeData.type)) {
            return jsonResponse({
                success: false,
                message: "Invalid trade type. Supported types are long and short"
            }, 400);
        }

        if (tradeData.leverage < 1 || tradeData.leverage > 100) {
            return jsonResponse({
                success: false,
                message: "Leverage must be between 1 and 100"
            }, 400);
        }

        if (tradeData.slippage > 10000 || tradeData.slippage < 10) {
            return jsonResponse({
                success: false,
                message: "Slippage value should be between 0.1 to 100 %"
            }, 400);
        }

        return jsonResponse({
            success: true,
            message: "Trade created successfully"
        });
  } catch (err) {
    // error
    return jsonResponse({
        success: false,
        message: "Internal Server Error"
    }, 500);
  }
};
