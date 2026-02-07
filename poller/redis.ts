import Redis from "ioredis";

export const redis = new Redis({
  host: "127.0.0.1",
  port: 6379, // or 6380 if you changed it
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis (poller)");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});
