import { verifyToken } from "../token";
import { jsonResponse } from "./jsonResponse";

export type Handler = (req: Request) => Response | Promise<Response>;

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }

  return null;
}

/** Email of the signed-in user (from the `authToken` session cookie), or null. */
export function getSessionEmail(req: Request): string | null {
  const token = getCookie(req, "authToken");
  return token ? verifyToken(token) : null;
}

/**
 * Wraps a handler so it only runs for a signed-in user. The user is attached
 * as `req.user`, which is where the controllers read it from.
 */
export const requireAuth = (handler: Handler): Handler => async (req) => {
  const email = getSessionEmail(req);

  if (!email) {
    return jsonResponse({ success: false, message: "Unauthorized Access" }, 401);
  }

  (req as any).user = { email };

  return handler(req);
};
