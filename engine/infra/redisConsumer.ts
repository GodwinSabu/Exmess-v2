import Redis from "ioredis";
import { processEvent } from "../events/processor";
import type { EngineEvent } from "../events/eventTypes";

const redis = new Redis("redis://127.0.0.1:6379");

const STREAM = "engine_stream";
const GROUP = "engine_group";
const CONSUMER = "engine_1";

async function ensureGroup() {
  try {
    await redis.xgroup("CREATE", STREAM, GROUP, "$", "MKSTREAM");
  } catch (err: any) {
    if (!err.message.includes("BUSYGROUP")) {
      throw err;
    }
  }
}

function fieldsToObject(fields: string[]) {
    const obj: Record<string, string> = {};
  
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
  
      if (key !== undefined && value !== undefined) {
        obj[key] = value;
      }
    }
  
    return obj;
  }

export async function startRedisConsumer() {
  await ensureGroup();

  console.log("🚀 Redis consumer started...");

  while (true) {
    const response = (await redis.xreadgroup(
        "GROUP",
        GROUP,
        CONSUMER,
        "COUNT",
        10,
        "BLOCK",
        0,
        "STREAMS",
        STREAM,
        ">"
      )) as [string, [string, string[]][]][] | null;
      console.log(response);

    if (!response) continue;

    for (const [, entries] of response) {
      for (const [id, fields] of entries) {
        try {
            const kv = fieldsToObject(fields);

            const data = kv["data"];
            if (!data) {
              console.error("Missing data field");
              continue;
            }
            
            const payload = JSON.parse(data);

          processEvent(payload as EngineEvent);

          await redis.xack(STREAM, GROUP, id);
        } catch (err) {
          console.error("❌ Failed to process event:", err);
        }
      }
    }
  }
}