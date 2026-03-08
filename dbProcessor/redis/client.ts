import Redis from "ioredis";

export const redis = new Redis("redis://127.0.0.1:6379");

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (e) => console.error("❌ Redis error:", e));


export const OPERATIONS_STREAM = "db_operations_queue";
export const SNAPSHOT_STREAM = "snapshot_queue";

export const GROUP = "db_processor_group";
export const CONSUMER = "db_processor_1";