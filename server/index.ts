import { serve } from "bun";

const server = serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    // Simple route: GET /
    if (url.pathname === "/") {
      return new Response("Hello from Bun Server!", { status: 200 });
    }

    // Simple JSON API: GET /api
    if (url.pathname === "/api") {
      return new Response(
        JSON.stringify({ message: "API working fine!", time: Date.now() }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Route not found
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🔥 Server running on http://localhost:${server.port}`);

