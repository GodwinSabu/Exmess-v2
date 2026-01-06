import { generateLinkToken, generateSessionToken, verifyToken } from "../token";
import { BACKEND_URL, FRONTEND_URL, NODE_ENV } from "../config";
import { sendAuthEmail } from "../resend";
import { jsonResponse } from "../utills/jsonResponse";
import { prisma } from "../../packages/db";



/**
 * TEMP in-memory users
 * (later replace with Prisma)
 */
export const signup = async (req: Request): Promise<Response> => {
  try {
      const { email } = await req.json() as { email?: string };
      if (!email) return jsonResponse({ error: "Email required" }, 400);


      const existingUser = await prisma.user.findUnique({
          where: {
              email
          }
      });

      if (existingUser) {
          return jsonResponse({
              success: false,
              message: "User already exists"
          }, 409);
      }

      const token = generateLinkToken(email);
      await sendAuthEmail(email, "signup", token);

      return jsonResponse({
          message: "Kindly check your mail for the signup link"
      });
  } catch (error: any) {
      return jsonResponse({
          message: "Internal Server error",
          error: String(error)
      }, 500);
  }
}


// ---------- SIGNIN ----------kk
export const signin = async (req: Request): Promise<Response> => {
  try {
      const { email } = await req.json() as { email?: string };
      if (!email) return jsonResponse({ error: "Email required" }, 400);

      const existingUser = await prisma.user.findUnique({
          where: {
              email
          }
      });

      if (!existingUser) {
          return jsonResponse({
              success: false,
              message: "User not found"
          }, 404);
      }

      const token = generateLinkToken(email);
      await sendAuthEmail(email, "signin", token)

      return jsonResponse({
          message: "Kindly check your mail for the signin link"
      });
  } catch (error: any) {
      return jsonResponse({
          message: "Internal Server error",
          error: error.message
      }, 500);
  }
}

// ---------- AUTH CALLBACK ----------dd
export const authPost = async (req: Request): Promise<Response> => {
  try {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');

      if (!token || typeof token !== "string") {
          return jsonResponse({ error: "Invalid token" }, 400);
      }

      const email = verifyToken(token);
      if (!email) return jsonResponse({ error: "Invalid/expired token" }, 400);

      const walletChannel = "user_wallet_stream";
      const event = "INITIALIZE_WALLET"

    //   await REDIS_PUSH_QUEUE.lpush(walletChannel, JSON.stringify({ email, event }))

      const sessionToken = generateSessionToken(email);

      const existingUser = await prisma.user.findUnique({
          where: { email }
      });

      if (!existingUser) {
          await prisma.user.create({
              data: {
                  email,
                  lastLoggedIn: new Date()
              }
          })
      }

      const isProd = process.env.NODE_ENV === "production";

      const cookieOptions = [
          "Path=/",
          "HttpOnly",
          isProd ? "SameSite=None" : "SameSite=Lax",
          isProd ? "Secure" : "",
          isProd ? "Domain=.rudrasankha.com" : "",
          "Max-Age=604800",
      ]
          .filter(Boolean)
          .join("; ");



      return new Response(null, {
          status: 302,
          headers: {
              Location: `${FRONTEND_URL}/dashboard`,
              "Set-Cookie": `authToken=${sessionToken}; ${cookieOptions}`,
          },
      });
  } catch (error) {
      console.log('error: ', error);
      return jsonResponse({
          message: "Internal Server Error"
      }, 500);
  }
}

export const logout = async (_req: Request): Promise<Response> => {
  try {

      const isProd = process.env.NODE_ENV === "production";

      const cookieOptions = [
          "Path=/",
          "HttpOnly",
          isProd ? "SameSite=None" : "SameSite=Lax",
          isProd ? "Secure" : "",
          isProd ? "Domain=.rudrasankha.com" : "",
          "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
      ]
          .filter(Boolean)
          .join("; ");

      return new Response(
          JSON.stringify({ message: "Logged out" }),
          {
              status: 200,
              headers: {
                  "Content-Type": "application/json",
                  "Set-Cookie": `authToken=; ${cookieOptions}`
              }
          }
      );
  } catch (error) {
      return jsonResponse(
          { message: "Internal Server Error", error: String(error) },
          500
      );
  }
};
