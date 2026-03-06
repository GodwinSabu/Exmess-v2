import { ensureGroup } from "./redis/streams.ts";
import { startDBProcessor } from "./consumer";

async function main() {

  await ensureGroup();

  await startDBProcessor();

}

main();