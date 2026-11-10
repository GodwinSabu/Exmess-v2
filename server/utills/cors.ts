import { FRONTEND_URL } from "../config";

/**
 * The frontend (FRONTEND_URL) is a different origin from this API, and it
 * sends the session cookie, so the browser needs explicit CORS approval.
 * Only that one origin is allowed.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");

  if (origin !== FRONTEND_URL) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withCors(req: Request, res: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    res.headers.set(key, value);
  }
  return res;
}
