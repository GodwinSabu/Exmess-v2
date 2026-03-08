import { redis, GROUP, CONSUMER, OPERATIONS_STREAM } from "./redis/client";
import { processDBOperation } from "./services/processDBOperation";

export async function startDBProcessor() {

  console.log("DB Processor started");

  while (true) {
    console.log("Waiting for Redis events...");

    const res = await redis.xreadgroup(
        "GROUP", GROUP, CONSUMER,
        "COUNT", 50,
        "BLOCK", 5000,
        "STREAMS", OPERATIONS_STREAM,
        ">"
      ) as any;
  
      console.log("Raw Redis response:", JSON.stringify(res)); // 👈 add this
      if (!res) {
        console.log("No messages yet, polling again..."); // 👈 add this
        continue;
      }
  
      console.log("Got messages!", res.length); // 👈 add this

    for (const [, entries] of res) {

      for (const [id, fields] of entries) {

        try {

            const obj = Object.fromEntries(
                fields.reduce((acc: any[], v: string, i: number) => {
                  if (i % 2 === 0) acc.push([v, fields[i + 1]]);
                  return acc;
                }, [])
              );
              
              const operation = obj.operation;
              const data = JSON.parse(obj.data);

          await processDBOperation(operation, data);

          await redis.xack(OPERATIONS_STREAM, GROUP, id);

        } catch (err) {

          console.error("DB operation failed:", err);

          await redis.xack(OPERATIONS_STREAM, GROUP, id);

        }

      }

    }

  }

}