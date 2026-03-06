import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { resolve } from "path";

// Load .env from package directory (needed when running from other workspaces like dbProcessor)
config({ path: resolve(import.meta.dir, ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter, log: ["error"] });
