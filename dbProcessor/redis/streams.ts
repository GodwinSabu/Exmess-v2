import { redis, GROUP, OPERATIONS_STREAM, SNAPSHOT_STREAM } from "./client";

export async function ensureGroup() {
  try {
    await redis.xgroup("CREATE", OPERATIONS_STREAM, GROUP, "$", "MKSTREAM");
    console.log("✅ Consumer group created:", GROUP); // 👈 add this
  } catch (e: any) {
    if (!String(e?.message || e).includes("BUSYGROUP")) {
      console.error("❌ ensureGroup failed:", e); // 👈 add this
      throw e;
    }
    console.log("✅ Consumer group already exists:", GROUP); // 👈 add this
  }
}