import { redis, GROUP, OPERATIONS_STREAM, SNAPSHOT_STREAM } from "./client";

export async function ensureGroup() {
  try {
    await redis.xgroup("CREATE", OPERATIONS_STREAM, GROUP, "0", "MKSTREAM");
  } catch (e: any) {
    if (!String(e?.message || e).includes("BUSYGROUP")) throw e;
  }
}