/**
 * Starts every service for local development:  bun run dev
 *
 * Each service runs in its own folder (the engine keeps its snapshot in its
 * working directory) with its output prefixed by its name. Ctrl+C stops them
 * all. If one service exits, the others keep running so you can read its error.
 *
 * Needs Postgres and Redis to be up first:  bun run infra
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..");

const services = [
  { name: "engine", cmd: ["bun", "run", "index.ts"] },
  { name: "poller", cmd: ["bun", "run", "index.ts"] },
  { name: "dbProcessor", cmd: ["bun", "run", "index.ts"] },
  { name: "server", cmd: ["bun", "--watch", "index.ts"] },
  { name: "frontend", cmd: ["bun", "--hot", "server.ts"] },
];

const width = Math.max(...services.map((service) => service.name.length));

/** Copy a child's output to ours, one line at a time, tagged with its name. */
async function relay(stream: ReadableStream<Uint8Array>, label: string, write: (text: string) => void) {
  const decoder = new TextDecoder();
  let pending = "";

  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true });

    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) write(`${label} ${line}\n`);
  }

  if (pending) write(`${label} ${pending}\n`);
}

let stopping = false;

const running = services.map(({ name, cmd }) => {
  const label = `[${name.padEnd(width)}]`;

  const child = Bun.spawn({
    cmd,
    cwd: join(root, name),
    env: { ...process.env, FORCE_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });

  relay(child.stdout, label, (text) => process.stdout.write(text));
  relay(child.stderr, label, (text) => process.stderr.write(text));

  child.exited.then((code) => {
    if (!stopping) console.error(`${label} exited with code ${code}`);
  });

  return child;
});

function stopAll() {
  if (stopping) return;
  stopping = true;

  for (const child of running) child.kill();
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
process.on("exit", stopAll);

await Promise.all(running.map((child) => child.exited));
