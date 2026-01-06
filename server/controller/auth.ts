import { prisma } from "@prisma/client";
import { generateLinkToken, generateSessionToken, verifyToken } from "../token";
import { BACKEND_URL, FRONTEND_URL, NODE_ENV } from "../config";
import { jsonResponse } from "../utils/jsonResponse";

// ---- MOCK EMAIL SENDER (for now) ----
async function sendAuthEmail(email: string, type: "signup" | "signin", token: string) {
  const link = `${BACKEND_URL}/api/v1/signin/post?token=${token}`;
  console.log(`📧 EMAIL TO: ${email}`);
  console.log(`[${type.toUpperCase()} LINK]: ${link}`);
}

// ---------- SIGNUP ----------
export const signup = async (req: Request): Promise<Response> => {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return jsonResponse({ error: "Email required" }, 400);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return jsonResponse({ message: "User already exists" }, 409);
    }

    const token = generateLinkToken(email);
    await sendAuthEmail(email, "signup", token);

    return jsonResponse({
      message: "Check your email for signup link",
    });
  } catch {
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
};

// ---------- SIGNIN ----------
export const signin = async (req: Request): Promise<Response> => {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return jsonResponse({ error: "Email required" }, 400);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return jsonResponse({ message: "User not found" }, 404);
    }

    const token = generateLinkToken(email);
    await sendAuthEmail(email, "signin", token);

    return jsonResponse({
      message: "Check your email for signin link",
    });
  } catch {
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
};

// ---------- AUTH CALLBACK ----------
export const authPost = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) return jsonResponse({ error: "Invalid token" }, 400);

  const email = verifyToken(token);
  if (!email) return jsonResponse({ error: "Expired token" }, 400);

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: { email, lastLoggedIn: new Date() },
    });
  } else {
    await prisma.user.update({
      where: { email },
      data: { lastLoggedIn: new Date() },
    });
  }

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
