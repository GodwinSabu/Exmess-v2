# superapp

A paper-trading platform for leveraged long/short positions on BTC, ETH and SOL,
priced from live Backpack Exchange data. Bun + TypeScript monorepo.

```
Backpack WS ──> poller ──┬─ engine_stream (Redis stream) ──> engine ──> db_operations_queue ──> dbProcessor ──> Postgres
                         │                                     ▲  │
                         └─ price_updates (Redis pub/sub)      │  └─ engine_responses (Redis pub/sub)
                                      │                        │                │
                                      ▼                        │                ▼
browser (frontend :3000) <── REST + WebSocket ──> server (:8000) ──────────────┘
```

| Service | What it does |
|---|---|
| `poller` | Streams best bid/ask from Backpack, publishes the mid price to the engine and to the server |
| `engine` | In-memory trading engine: wallets, positions, PnL, liquidations. Snapshots to disk every 10s |
| `server` | HTTP API + price WebSocket. Magic-link auth. Sends trade requests to the engine and waits for the answer |
| `dbProcessor` | Writes trades from the engine to Postgres, off the engine's hot path |
| `frontend` | The trading terminal (React + TradingView's `lightweight-charts`) |
| `packages/db` | Shared Prisma client and schema |

## Run it

Needs [Bun](https://bun.com) and Docker (for Postgres + Redis).

```bash
bun install
bun run infra        # docker compose up -d  (Postgres :5432, Redis :6379)
bun run db:migrate   # apply the Prisma migrations (first run only)
bun run dev          # start poller, engine, server, dbProcessor and frontend
```

Then open http://localhost:3000.

Each service can also be started on its own with `bun run dev` inside its folder.
Run the engine from `engine/`: it reads and writes `engine_snapshot.json` in the current directory.

### Signing in

Sign-in is a passwordless magic link. No email provider is wired up yet (`server/resend.ts`
only logs), so outside production the link is printed in the server console and also shown
in the sign-in dialog. Every new account starts with 1,000 USDC of demo funds.

## API (server, port 8000)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/signup`, `/api/v1/signin` | | Request a magic link |
| GET | `/api/v1/signin/post?token=` | | Magic-link callback: sets the session cookie, redirects to the frontend |
| GET | `/api/v1/me` | yes | Who is signed in |
| POST | `/api/v1/logout` | | Clear the session cookie |
| POST | `/api/v1/create` | yes | Open a position `{ asset, type, margin, leverage, slippage, expectedPrice? }` |
| POST | `/api/v1/close` | yes | Close a position `{ orderId }` |
| GET | `/api/v1/balance` | yes | Free balance |
| GET | `/api/v1/trades/open` | yes | Open positions (from the engine) |
| GET | `/api/v1/trades/history` | yes | Closed and liquidated trades (from Postgres) |
| GET | `/api/v1/prices` | | Latest price per asset |
| GET | `/api/v1/candles?asset=&interval=` | | OHLCV history (proxied from Backpack) |
| GET | `/api/v1/tickers` | | 24h stats (proxied from Backpack) |
| WS | `/ws` | | Live prices: one `snapshot`, then `price` messages |

### Units

Trading endpoints use integers, the same as the engine:

- `margin`, `balance`, `pnl`: cents of USDC (`10000` = $100.00)
- prices: the asset's smallest unit (BTC 4 decimals, ETH and SOL 6), so BTC `735953500` = 73,595.35
- `slippage`: basis points (`100` = 1%)

`/candles` and `/tickers` return ordinary decimal numbers.

Asset decimals are defined in three places that must agree: `engine/config.ts`,
`poller/store.ts` and `frontend/src/config.ts`.

## Safety rules worth knowing

- Trades only execute against a price refreshed in the last 10 seconds. If the poller stops,
  the engine and the API refuse to open or close positions rather than use an old price.
- A request the API has given up on (engine down, 7s timeout) is never executed late: the
  engine drops requests older than 5 seconds.
- A position is liquidated when the price reaches its liquidation price; the margin is lost.

## Tests

```bash
cd engine && bun test
```
