import Redis from "ioredis";
import { processEvent } from "../events/processor";
import type { EngineEvent } from "../events/eventTypes";
import { hasProcessed, markProcessed } from "../state/eventStore";

const redis = new Redis("redis://127.0.0.1:6379");

const STREAM = "engine_stream";
const GROUP = "engine_group";
const CONSUMER = "engine_1";
const DEAD_LETTER_STREAM = "engine_dead_letter_stream";

async function ensureGroup() {
  try {
    await redis.xgroup("CREATE", STREAM, GROUP, "$", "MKSTREAM");
  } catch (err: any) {
    if (!err.message.includes("BUSYGROUP")) {
      throw err;
    }
  }
}

async function replayPendingEvents() {

  console.log("Replaying pending events...");

  const pending = await redis.xpending(STREAM, GROUP) as [number, string, string, any[]];

if (!pending || pending[0] === 0) {
  console.log("No pending events");
  return;
}

  const res = await redis.xreadgroup(
    "GROUP",
    GROUP,
    CONSUMER,
    "COUNT",
    50,
    "STREAMS",
    STREAM,
    "0"
  ) as [string, [string, string[]][]][] | null;

  if (!res) return;

  for (const [, entries] of res) {
    for (const [id, fields] of entries) {

      try {

        const kv = fieldsToObject(fields);

        const data = kv["data"];
        if (!data) continue;

        const payload = JSON.parse(data);

        processEvent(payload as EngineEvent);

        await redis.xack(STREAM, GROUP, id);

        console.log("Replayed event:", id);

      } catch (err) {
        console.error("Replay failed:", err);
      }

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
  await replayPendingEvents();

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
        let payload: unknown = undefined;
      
        try {
          const kv = fieldsToObject(fields);
          const data = kv["data"];
      
          if (!data) {
            console.error("Missing data field");
            continue;
          }
      
          payload = JSON.parse(data);

            if (!hasProcessed(id)) {
              processEvent(payload as EngineEvent);
              markProcessed(id);
            }
            
            await redis.xack(STREAM, GROUP, id);
        } catch (err) {
          console.error("❌ Failed to process event:", err);

          await redis.xadd(
            DEAD_LETTER_STREAM,
            "*",
            "originalId",
            id,
            "error",
            String(err),
            "data",
            JSON.stringify(payload)
          );
        }
      }
    }
  }
}
