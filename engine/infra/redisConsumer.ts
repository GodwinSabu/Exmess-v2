import Redis from "ioredis";
import { processEvent } from "../events/processor";
import { decodeEvent } from "../events/decode";
import { hasProcessed, markProcessed } from "../state/eventStore";
import { redis as publisher } from "./redis/client";
import { REQUEST_TTL_MS } from "../config";

// Dedicated connection: XREADGROUP ... BLOCK ties the connection up.
const redis = new Redis("redis://127.0.0.1:6379");

const STREAM = "engine_stream";
const GROUP = "engine_group";
const CONSUMER = "engine_1";
const DEAD_LETTER_STREAM = "engine_dead_letter_stream";

// The API server listens here for the result of each request it sent.
const RESPONSE_CHANNEL = "engine_responses";

type StreamReply = [string, [string, string[]][]][] | null;

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

/** JSON has no bigint; amounts go out as plain numbers (all far below 2^53). */
function toJSON(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v));
}

async function respond(
  requestId: string,
  body: { ok: true; data: unknown } | { ok: false; error: string }
) {
  try {
    await publisher.publish(RESPONSE_CHANNEL, toJSON({ requestId, ...body }));
  } catch (err) {
    console.error("Failed to publish engine response:", err);
  }
}

/**
 * Process one stream entry, then ACK it whatever happened.
 *  - Events with a `requestId` came from the API server: the result (or the
 *    rejection reason) is published back on RESPONSE_CHANNEL.
 *  - Events without one (price updates) have nobody waiting, so a failure is
 *    parked on the dead-letter stream instead.
 */
async function handleEntry(id: string, fields: string[]) {
  let raw: any = undefined;
  let requestId: string | undefined;

  try {
    const data = fieldsToObject(fields)["data"];
    if (!data) throw new Error("Missing data field");

    raw = JSON.parse(data);

    if (typeof raw?.requestId === "string") requestId = raw.requestId;

    if (hasProcessed(id)) return;

    // The server already gave up on this request; running it now would
    // open/close a trade the user was told had failed.
    if (
      requestId &&
      typeof raw.sentAt === "number" &&
      Date.now() - raw.sentAt > REQUEST_TTL_MS
    ) {
      throw new Error("Request expired before the engine could process it");
    }

    const result = await processEvent(decodeEvent(raw));

    markProcessed(id);

    if (requestId) await respond(requestId, { ok: true, data: result ?? null });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (requestId) {
      await respond(requestId, { ok: false, error: message });
    } else {
      console.error("❌ Failed to process event:", err);

      await redis.xadd(
        DEAD_LETTER_STREAM,
        "MAXLEN", "~", 1000,
        "*",
        "originalId", id,
        "error", message,
        "data", JSON.stringify(raw ?? null)
      );
    }
  } finally {
    await redis.xack(STREAM, GROUP, id);
  }
}

async function replayPendingEvents() {

  console.log("Replaying pending events...");

  const pending = await redis.xpending(STREAM, GROUP) as [number, string, string, any[]];

  if (!pending || pending[0] === 0) {
    console.log("No pending events");
    return;
  }

  // Id "0" returns this consumer's delivered-but-unacked entries. handleEntry
  // ACKs each one, so the loop ends when none are left.
  while (true) {
    const res = await redis.xreadgroup(
      "GROUP", GROUP, CONSUMER,
      "COUNT", 50,
      "STREAMS", STREAM,
      "0"
    ) as StreamReply;

    const entries = res?.[0]?.[1] ?? [];
    if (entries.length === 0) break;

    for (const [id, fields] of entries) {
      await handleEntry(id, fields);
      console.log("Replayed event:", id);
    }
  }
}

export async function startRedisConsumer() {
  await ensureGroup();
  await replayPendingEvents();

  console.log("🚀 Redis consumer started...");

  while (true) {
    const response = (await redis.xreadgroup(
      "GROUP", GROUP, CONSUMER,
      "COUNT", 10,
      "BLOCK", 0,
      "STREAMS", STREAM,
      ">"
    )) as StreamReply;

    if (!response) continue;

    for (const [, entries] of response) {
      for (const [id, fields] of entries) {
        await handleEntry(id, fields);
      }
    }
  }
}
