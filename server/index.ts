import { serve } from "bun";
import { authPost, signin, signup } from "./controller/auth";

const server = serve({
  port: 8000,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    console.log(req.method, pathname);

    // -------- AUTH ROUTES --------

    if (pathname === "/api/v1/signup" && req.method === "POST") {
      return signup(req);
    }

    if (pathname === "/api/v1/signin" && req.method === "POST") {
      return signin(req);
    }

    if (pathname === "/api/v1/signin/post" && req.method === "GET") {
      return authPost(req);
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

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🔥 Server running on http://localhost:${server.port}`);