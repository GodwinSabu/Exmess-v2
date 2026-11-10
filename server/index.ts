import { serve } from "bun";
import { authPost, logout, me, signin, signup } from "./controller/auth";
import {
  closeTrade,
  createTrade,
  getBalance,
  getOpenTrades,
  getTradeHistory,
} from "./controller/trade";
import { getCandles, getPrices, getTickers } from "./controller/market";
import { PORT } from "./config";
import { requireAuth } from "./utills/auth";
import type { Handler } from "./utills/auth";
import { corsHeaders, withCors } from "./utills/cors";
import { getLatestPrices, onPriceTick } from "./engine";

// Every connected browser subscribes to this topic for live prices.
const PRICE_TOPIC = "prices";

const routes: Record<string, Handler> = {
  // -------- AUTH ROUTES --------
  "POST /api/v1/signup": signup,
  "POST /api/v1/signin": signin,
  "GET /api/v1/signin/post": authPost,
  "POST /api/v1/logout": logout,
  "GET /api/v1/me": requireAuth(me),

  // -------- TRADING ROUTES (signed-in users, answered by the engine) --------
  "POST /api/v1/create": requireAuth(createTrade),
  "POST /api/v1/close": requireAuth(closeTrade),
  "GET /api/v1/balance": requireAuth(getBalance),
  "GET /api/v1/trades/open": requireAuth(getOpenTrades),
  "GET /api/v1/trades/history": requireAuth(getTradeHistory),

  // -------- MARKET DATA ROUTES (public) --------
  "GET /api/v1/prices": getPrices,
  "GET /api/v1/candles": getCandles,
  "GET /api/v1/tickers": getTickers,
};

const server = serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    const { pathname } = url;

    // -------- LIVE PRICE WEBSOCKET --------

    if (pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("Expected a WebSocket connection", { status: 426 });
    }

    // CORS preflight from the frontend
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    console.log(req.method, pathname);

    const handler = routes[`${req.method} ${pathname}`];

    if (handler) {
      return withCors(req, await handler(req));
    }

    // -------- TEST ROUTES --------

    if (pathname === "/") {
      return new Response("Hello from Bun Server!", { status: 200 });
    }

    if (pathname === "/api") {
      return new Response(
        JSON.stringify({ message: "API working fine!", time: Date.now() }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return withCors(req, new Response("Not Found", { status: 404 }));
  },

  websocket: {
    open(ws) {
      ws.subscribe(PRICE_TOPIC);

      // Send what we already know so the UI has prices before the next tick.
      ws.send(JSON.stringify({ type: "snapshot", prices: getLatestPrices() }));
    },
    message() {
      // Server -> client only; nothing to handle.
    },
    close(ws) {
      ws.unsubscribe(PRICE_TOPIC);
    },
  },
});

// Relay every price the poller publishes to all connected browsers.
onPriceTick((tick) => {
  server.publish(PRICE_TOPIC, JSON.stringify({ type: "price", ...tick }));
});

console.log(`🔥 Server running on http://localhost:${server.port}`);
