import { redis } from "./redis";

async function test() {
  await redis.set("poller-test", "hello-redis");
  const value = await redis.get("poller-test");

  console.log("Value from Redis:", value);
  process.exit(0);
}

test();
