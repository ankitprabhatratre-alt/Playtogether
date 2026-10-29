# 🎉 PlayTogether

Real-time multiplayer party games for friends: **Create Room → Pick a Game → Set Passcode → Share Link → Friends Join → Play.**
No accounts: players join with a display name and the room passcode. The server is authoritative for all game state.

| Game | Players | What it does |
|---|---|---|
| 🧠 **Quiz Battle** | 1–16 | 6 categories, difficulty, timer, speed bonus, answer reveal, leaderboard |
| 🔗 **Word Chain** | 2–12 | Last letter starts the next word; dictionary or basic validation; elimination on timeout |
| 🕵️ **Impostor** | 3–12 | Secret word, one impostor (undercover "different word" or "blank" variant); clues → vote → reveal; no leaks |
| 🎨 **Draw & Guess** | 2–12 | Rotating drawer, word choice, live stroke sync, private guesses, hints |
| ❌ **Tic-Tac-Toe Arena** | 2–16 | Two players + spectator queue, winner stays, rematch, move timer |
| 🤔 **Would You Rather?** | 2–16 | Private votes, aggregate percentages, majority scoring, 139 questions |
| 🎭 **Truth or Dare** | 2–16 | Family-friendly prompts, categories, custom prompts, skip/next controls |
| ⚡ **Rapid Categories** | 1–16 | Category + letter race, no repeats, server-side validation and scoring |

Content banks: 96 quiz questions · 139 would-you-rather dilemmas · 148 drawing words (3 difficulties) · 55 impostor word pairs · 110 truth/dare prompts in 3 packs (+ your own) · 9 categories with curated answer lists · 172k-word dictionary.

---

## Contents
1. [Requirements](#requirements)
2. [Quick start (macOS / Linux)](#quick-start-macos--linux)
3. [Windows setup](#windows-setup)
4. [Database (optional PostgreSQL)](#database-optional-postgresql)
5. [Scripts](#scripts)
6. [Testing locally with several players](#testing-locally-with-several-players)
7. [Automated tests](#automated-tests)
8. [Production build & deployment](#production-build--deployment)
9. [Configuration](#configuration)
10. [Architecture](#architecture)
11. [Security](#security)
12. [WebSocket troubleshooting](#websocket-troubleshooting)
13. [Known limitations](#known-limitations)

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | **20.19+** (LTS 20 or 22) | Tested on 20.20. Vite 6 / React 19 need ≥ 20.19 |
| npm | 10+ | ships with Node |
| PostgreSQL | 14+ (tested on **18.4**) | **Optional.** Without it everything runs in memory |
| Python 3 + Playwright | optional | only for the browser end-to-end tests |

## Quick start (macOS / Linux)

```bash
cd playtogether
npm install                # installs all workspaces (shared, server, client)
cp .env.example .env       # optional; defaults work without it
npm run dev                # API + sockets on :3001, web app on :5173
```

Open **http://localhost:5173** → **Play With Friends**.

## Windows setup

1. Install **Node.js 20 LTS or 22 LTS** from <https://nodejs.org> (the installer adds `node` and `npm` to PATH). Check with `node -v` in a *new* terminal.
2. (Optional) Install **Git for Windows** if you are cloning the repo.
3. In **PowerShell** or **Command Prompt**:
   ```powershell
   cd C:\path\to\playtogether
   npm install
   copy .env.example .env
   npm run dev
   ```
4. Open <http://localhost:5173>.

Windows notes:
- **Firewall prompt:** the first time Node listens, Windows asks whether to allow it. To test from phones on your Wi-Fi, allow **Private networks**.
- **Execution policy:** if PowerShell refuses to run `npm` (`running scripts is disabled`), run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use Command Prompt.
- **Setting env vars per command:** PowerShell: `$env:PORT=4000; npm start`. cmd: `set PORT=4000 && npm start`. Using the `.env` file is easier.
- **Long paths / OneDrive:** keep the project outside OneDrive-synced folders, which can lock `node_modules` files during install.
- **PostgreSQL on Windows:** use the EDB installer from postgresql.org (remember the password you set for `postgres`), or Docker Desktop: `docker run --name pt-db -e POSTGRES_PASSWORD=change-me -p 5432:5432 -d postgres:17`.

## Database (optional PostgreSQL)

**Without `DATABASE_URL`** the server keeps everything in memory. Rooms disappear on restart, which is fine for a party night on one machine.

**With PostgreSQL**, rooms, players (hashed tokens), hashed passcodes and finished game sessions are persisted. After a restart, a room is **lazily restored** the first time someone opens it: same code, same passcode, same players and tokens, and recent game history. Players reconnect automatically. Rooms come back in the lobby; an in-progress round is not resumed.

```bash
# 1. create a database (example with psql)
createdb playtogether
# 2. set DATABASE_URL in .env, e.g.
#    DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/playtogether?schema=public
# 3. apply migrations and seed the game catalog
npm run db:deploy          # applies prisma/migrations (production-safe)
npm run db:seed            # upserts the 8 game definitions
```

During development you can use `npm run db:migrate` (prisma migrate dev), which also creates new migrations when you edit `prisma/schema.prisma`. If the database is unreachable at startup, the server logs an error and falls back to memory, so the app stays up. Database writes are queued and best-effort, so a slow database never blocks gameplay.

## Scripts

Run from the repo root:

| Command | What it does |
|---|---|
| `npm run dev` | server (tsx watch, port 3001) + client (Vite, port 5173, proxies `/api` and `/socket.io`) |
| `npm run dev:server` / `npm run dev:client` | either half on its own |
| `npm run typecheck` | `tsc --noEmit` for shared, server, client |
| `npm test` | Vitest unit + Socket.IO integration tests (server) |
| `npm run test:e2e` | Playwright browser tests (needs the app running, see below) |
| `npm run build` | client production bundle → `client/dist`, server bundle → `server/dist` |
| `npm start` | runs `server/dist/index.js` (serves the client too when `NODE_ENV=production`) |
| `npm run db:generate` / `db:migrate` / `db:deploy` / `db:seed` | Prisma helpers |

## Testing locally with several players

Each player needs a **separate browser session**: the session token lives in that tab's `sessionStorage`.

- **One computer:** use a normal window, an incognito/private window, and a different browser (e.g. Chrome + Chrome Incognito + Firefox). Each is a different player. Several normal tabs in the same browser work too, because each tab has its own `sessionStorage`. If you open the same player in two tabs, the newer tab takes over and the old one shows "opened in another tab".
- **Phones on the same Wi-Fi:** run `npm run dev`, then open `http://<your-computer-LAN-IP>:5173` on the phone. Vite listens on `0.0.0.0`. Find your IP with `ipconfig` (Windows) or `ip addr` / `ifconfig` (macOS/Linux). The invite link and QR code use the address the host opened, so **the host should also open the LAN address** (not `localhost`) before sharing.
- **Reconnect test:** reload a player's tab mid-game, or toggle airplane mode for a few seconds. The player keeps their seat, score and locked-in answers.

## Automated tests

```bash
npm test                     # 45 tests: game rules, room auth, permissions, reconnect, full flows
```

| Suite | Covers |
|---|---|
| `server/tests/games.test.ts` | rules and scoring for all 8 games via a deterministic fake context: speed bonus, word validation, TTT win/draw/forfeit/rematch, impostor secrecy and tie votes, drawing word privacy and stroke authorization, categories duplicates and strict mode, WYR aggregates, ToD turn control |
| `server/tests/rooms.test.ts` | room creation validation, **wrong passcode rejected**, brute-force lockout, duplicate names, full rooms, socket auth (bad or cross-room tokens), **host-only actions rejected for guests**, invalid transitions, malformed actions, spectators can't act, client-sent scores ignored, **idempotent actionIds**, kick and close, **reconnect restores state without duplicates**, second-tab takeover, host transfer (manual, on leave, after disconnect grace), HTTP rate limits |
| `server/tests/flows.test.ts` | full 3-player Quiz Battle over real sockets (same question, deadline and final results for all) + start → play → end → lobby for **every** game |
| `server/tests/security.test.ts` | scrypt passcode hashing, ID entropy, settings validation and sanitization, CORS policy, winner/tie labels |
| `server/tests/persistence.pg.test.ts` | **PostgreSQL**: rows written, secrets hashed, room survives a server restart with the same tokens. Runs only when `TEST_DATABASE_URL` points at a migrated database |

Browser end-to-end tests (three isolated browser contexts emulating phone, desktop and tablet):

```bash
pip install playwright && python -m playwright install chromium
npm run dev                  # in another terminal
npm run test:e2e             # or BASE_URL=http://localhost:3001 for a production build
```

`tests/e2e/multiplayer_e2e.py` runs create → wrong passcode → join via link and via code → Quiz Battle (with a mid-round reload) → identical results → lobby → switch game → Would You Rather. `tests/e2e/games_e2e.py` covers the other six games, including a **pixel check that drawing strokes appear on the other players' canvases**. Both fail if any page horizontally overflows or throws a JS error. Screenshots go to `tests/e2e/screenshots/`.

## Production build & deployment

PlayTogether deploys as **one Node service** that serves the built client, the REST API and Socket.IO on the same origin (no CORS setup needed).

```bash
npm ci
npm run build
NODE_ENV=production PORT=3001 npm start         # PowerShell: $env:NODE_ENV="production"; npm start
```

**Docker:**

```bash
docker build -t playtogether .
docker run -p 3001:3001 --env-file .env playtogether
# with DATABASE_URL set, the container runs `prisma migrate deploy` before starting
```

**Hosting checklist** (Render, Railway, Fly.io, a VPS, etc.):
- Use a host that supports **long-lived WebSocket connections**. Classic serverless functions do not.
- Run **exactly one instance** (see limitations), or add sticky sessions plus a shared state store first.
- Behind a proxy or load balancer: set `TRUST_PROXY=true` (correct client IPs for rate limits). Make sure the proxy forwards `Upgrade`/`Connection` headers and has an idle timeout above 30 s.
- Served over HTTPS: set `HTTPS_ONLY=true` (HSTS + `upgrade-insecure-requests`).
- If the frontend is hosted on a different origin, list it in `CLIENT_ORIGINS`.
- Health check: `GET /api/health`.

Example nginx location block:

```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 75s;
}
```

## Configuration

All options are in **`.env.example`** (placeholders only). The most important:

| Variable | Default | Purpose |
|---|---|---|
| `PORT`, `HOST` | `3001`, `0.0.0.0` | listen address |
| `DATABASE_URL` | empty | optional PostgreSQL |
| `CLIENT_ORIGINS` | empty | extra allowed origins (same-origin always allowed) |
| `TRUST_PROXY` | `false` | trust `X-Forwarded-*` |
| `HTTPS_ONLY` | `false` | HSTS + upgrade-insecure-requests |
| `ROOM_IDLE_TTL_MINUTES` | `30` | inactive rooms are closed after this long |
| `ROOM_MAX_AGE_HOURS` | `12` | hard limit on a room's lifetime |
| `HOST_TRANSFER_GRACE_SECONDS` | `30` | how long a disconnected host keeps the role |
| `CLEANUP_INTERVAL_SECONDS` | `60` | cleanup sweep interval |

## Architecture

```
playtogether/
├─ shared/src/         typed protocol, game catalog + settings schemas, per-game state types, sanitizers
├─ server/src/
│  ├─ rooms/           Room (lifecycle state machine, timers, membership) + RoomManager (lookup, cleanup, rehydrate)
│  ├─ games/           8 modules implementing one GameModule interface + registry
│  ├─ socket/          Socket.IO auth middleware + typed, acked, validated event handlers
│  ├─ http/            REST: create room, preview, join (passcode check), health, games
│  ├─ persistence/     MemoryStore | PrismaStore (queued, best-effort writes)
│  ├─ security/        scrypt passcode hashing
│  └─ content/         question / word / prompt banks
├─ server/data/        ENABLE word list (172k words) for word validation
├─ server/tests/       Vitest unit + integration tests
├─ client/src/         React 19 + Vite; pages, room provider (socket + resync), game views
├─ prisma/             schema + migrations
└─ tests/e2e/          Playwright multi-browser tests
```

**Room lifecycle:** `WAITING_ROOM → GAME_STARTING → PLAYING ⇄ ROUND_RESULTS → NEXT_ROUND → … → FINAL_RESULTS → WAITING_ROOM`. Every transition and every timer deadline is decided on the server. Clients render the server deadline using a measured clock offset, so countdowns match across devices.

**Game module interface** (`server/src/games/types.ts`): `initializeGame`, `startGame`, `handlePlayerAction`, `getPublicState`, `getPrivateStateForPlayer`, `advanceGame`, `finishGame`, `cleanupGame` (+ optional `handleStroke`, `onConnectionChange`, `onPlayerRemoved`). Games only touch the room through a narrow `GameContext` (award points, set timers, end the round), so adding a game means adding a module, its zod action schema and its settings descriptor.

**Sync model:**
- After every change, each socket gets a public `room:state` snapshot plus its own `game:private` payload: your word, your vote, your answer.
- Secrets (correct answers, impostor identity, the drawing word, individual votes) exist only in private payloads or appear after the reveal.
- Every client action is acked, carries an `actionId` (duplicates are answered from a cache, never re-applied), and is zod-validated.
- Drawing strokes are batched (~25/s), normalized to a 10 000-unit grid, relayed only from the current drawer, and replayed to late joiners and reconnecting players.

**Why no Redis?** One Node process keeps all live state in memory, which is the simplest correct design for a single instance. Redis (or similar) only becomes necessary with several instances; see limitations.

## Security

- Passcodes: **scrypt** hash with a per-room random salt, verified only on the server; never returned by any API. Brute force: 8 wrong attempts per 10 min per IP+room → 429.
- Room codes: 8 characters from a 31-symbol alphabet (~8.5×10¹¹ combinations); player tokens: 256-bit random, stored as SHA-256 hashes.
- Socket auth happens in the handshake; every event re-checks membership. Host-only events (start, kick, transfer, close, settings, next, end, lobby) are enforced on the server.
- Input: strict zod schemas (unknown fields rejected for settings, stripped for actions), length limits, control characters removed, React escaping on output.
- Rate limits: HTTP create/join/read limits per IP, per-socket event and stroke limits, 64 KB socket message cap, 32 KB JSON body cap.
- Headers via helmet: strict CSP (`script-src 'self'`), `frame-ancestors 'none'`, nosniff, no-referrer, COOP. HSTS only when `HTTPS_ONLY=true`.
- CORS / Socket.IO origin check: same-origin plus the `CLIENT_ORIGINS` allowlist (others get 403).
- Truth or Dare content is family-friendly and contains no prompts asking for personal or identifying information, contacting people, or anything dangerous. Custom prompts are sanitized and length-limited.
- `npm audit --omit=dev` reports one advisory in a Prisma CLI dependency (`deepmerge-ts`, used when the CLI loads its own config at migrate time; not reachable from player input). The fix requires the breaking Prisma 7 upgrade.

## WebSocket troubleshooting

| Symptom | Fix |
|---|---|
| "Reconnecting…" banner never goes away | Is the server running on 3001? In dev, the client must be opened via Vite (5173), which proxies `/socket.io`. |
| Works on the PC, not on a phone | Open the LAN IP, not `localhost`. Allow Node through the firewall (Windows: Private networks). Phone and PC must be on the same Wi-Fi (guest networks often isolate devices). |
| 400/403 on `/socket.io/` | The page origin isn't allowed. Serve the client from the same origin, or add it to `CLIENT_ORIGINS`. |
| Connects, then drops every ~60 s behind nginx/a load balancer | Forward `Upgrade`/`Connection` headers and raise the proxy idle timeout (`proxy_read_timeout` ≥ 60 s). The server pings every 10 s. |
| Stuck on long-polling | Corporate proxies or antivirus can block WebSockets. Socket.IO falls back to polling automatically; it works, just with more latency. |
| "Session expired / room not found" after restarting the server | Expected without `DATABASE_URL` (memory mode). With PostgreSQL the room is restored. |
| Old tab says "opened in another tab" | The same player connected from a newer tab; only one connection per player is kept. |
| Mobile browser in the background | iOS/Android pause background tabs. On return the client reconnects and resyncs automatically. Players who stay away past their turn timer are skipped. |

## Known limitations

- **Single instance.** Live game state is in memory in one Node process. Horizontal scaling needs sticky sessions plus a shared store/adapter (e.g. Redis + `@socket.io/redis-adapter`) and moving room state out of process.
- **No mid-round resume after a server restart.** With PostgreSQL, rooms, players and history are restored, but a game that was running returns to the lobby.
- **Word validation:**
  - **Word Chain** uses the public-domain **ENABLE** list (172k English words). It excludes proper nouns and some modern/regional words, and allows rare words most people don't know. "Basic" mode only checks letters, length, the starting letter and repeats.
  - **Rapid Categories** verifies answers against curated per-category lists with simple plural handling. "Lenient" mode accepts unlisted answers for fewer points; "strict" rejects them. Neither knows every valid answer. Players settle disputes socially.
- **English-only content.**
- **Truth or Dare** relies on players to act; the app can't verify that a dare was done.
- **No accounts or moderation tools** beyond host kick. Room codes plus passcodes keep strangers out, but anyone you give the passcode to can join.
- The Dockerfile follows standard practice but was **not built in the development sandbox** (no Docker available there). The same build and start commands were verified directly.
