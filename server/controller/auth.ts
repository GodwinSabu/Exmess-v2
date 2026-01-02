import { generateLinkToken, generateSessionToken, verifyToken } from "../token";
import { BACKEND_URL, FRONTEND_URL, NODE_ENV } from "../config";
import { sendAuthEmail } from "../resend";
import { jsonResponse } from "../utills/jsonResponse


/**
 * TEMP in-memory users
 * (later replace with Prisma)
 */
const users = new Set<string>();

// ---------- SIGNUP ----------
export const signup = async (req: Request): Promise<Response> => {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return jsonResponse({ error: "Email required" }, 400);

    if (users.has(email)) {
      return jsonResponse(
        { success: false, message: "User already exists" },
        409
      );
    }

    const token = generateLinkToken(email);
    const link = `${BACKEND_URL}/api/v1/signin/post?token=${token}`;

    await sendAuthEmail(email, "signup", link);

    return jsonResponse({
      success: true,
      message: "Check your email for signup link",
    });
  } catch (err) {
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
};

// ---------- SIGNIN ----------kk
export const signin = async (req: Request): Promise<Response> => {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return jsonResponse({ error: "Email required" }, 400);

    if (!users.has(email)) {
      return jsonResponse(
        { success: false, message: "User not found" },
        404
      );
    }

    const token = generateLinkToken(email);
    const link = `${BACKEND_URL}/api/v1/signin/post?token=${token}`;

    await sendAuthEmail(email, "signin", link);

    return jsonResponse({
      success: true,
      message: "Check your email for signin link",
    });
  } catch (err) {
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
};

// ---------- AUTH CALLBACK ----------ddd
export const authPost = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) return jsonResponse({ error: "Invalid token" }, 400);

  const email = verifyToken(token);
  if (!email) return jsonResponse({ error: "Expired token" }, 400);

  users.add(email);

  const sessionToken = generateSessionToken(email);
  const isProd = NODE_ENV === "production"; 
  const cookie = [
    `authToken=${sessionToken}`,
    "Path=/",
    "HttpOnly",
    isProd ? "Secure" : "",
    isProd ? "SameSite=None" : "SameSite=Lax",
    "Max-Age=604800",
  ]
    .filter(Boolean)
    .join("; ");

  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie": cookie,
      Location: `${FRONTEND_URL}/dashboard`,
    },
  });
};
