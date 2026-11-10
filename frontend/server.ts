import index from "./index.html";

/**
 * Serves the trading terminal. Bun bundles index.html (and the TSX/CSS it
 * imports) on the fly, with hot reload in development.
 *
 * The app talks to the API server on :8000 directly (REST + WebSocket);
 * this process only serves the UI.
 */

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

const server = Bun.serve({
  port: PORT,
  routes: {
    // Single-page app: "/", "/dashboard" and anything else get the same page.
    "/*": index,
  },
  development: isProd ? false : { hmr: true, console: true },
});

console.log(`📈 Frontend running on http://localhost:${server.port}`);
