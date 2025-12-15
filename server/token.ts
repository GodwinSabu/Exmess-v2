import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config";

const LINK_TOKEN_EXPIRY = "5m";
const SESSION_TOKEN_EXPIRY = "7d";

export const generateLinkToken = (email: string) => {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: LINK_TOKEN_EXPIRY });
};

export const generateSessionToken = (email: string) => {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: SESSION_TOKEN_EXPIRY });
};

export const verifyToken = (token: string): string | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    return decoded.email;
  } catch {
    return null;
  }
};
   