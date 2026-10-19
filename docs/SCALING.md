# Scaling the backend — analysis and staged plan

Date: 2026-10-12
Status: **Proposed.** Recommendation for v1.0: run a single instance, deliberately. This document is
the input for the roadmap's open decision on scaling (Phase 4); nothing here is implemented yet.

## Where state lives today

| Concern | Where | Survives a second instance? |
|---|---|---|
| Rooms, live game state, presence, deck snapshots | `RoomManager` (in-memory `Map`) | **No** — each process has its own rooms |
| Sessions (sessionId ↔ socketId, reconnect) | `SessionManager` (in-memory `Map`) | **No** |
| Socket.io rooms and `emitToRoom` | Socket.io default in-memory adapter | **No** — only reaches sockets on the same process |
| Rate limiting | `ThrottlerModule` default in-memory storage | Per instance only (limits multiply by N) |
| Abandoned-room janitor | `setInterval` in `RoomManager` | Per instance (fine while rooms are per instance) |
| AFK / forfeit claims | Evaluated lazily from timestamps at claim time | Yes — no timers to coordinate |
| Auth (users, refresh tokens) | Postgres via Prisma; stateless JWT | Yes |
| Collection, decks | Postgres | Yes |
| Character catalog | Loaded from `tmplt/` at boot, read-only | Yes — every instance loads the same build |

Transport: the Flutter client (`Goodlock-app`, `lib/net/game_socket.dart`) connects with
`transports: ['websocket']`, so there is no HTTP long-polling phase and no sticky sessions are
needed just to hold a connection. (The deleted React client used Socket.io defaults, which start
on long-polling and need sticky sessions behind a load balancer.)

## Why "just add Redis" is two different things

1. **Socket.io Redis adapter** (`@socket.io/redis-adapter`): broadcasts are relayed through Redis
   pub/sub, so `emitToRoom` reaches sockets on every instance. Cheap to add. It solves *delivery* only:
   the game state is still inside one process.
2. **Game state in Redis**: new adapters behind `RoomPort` / `SessionPort` (the hexagonal ports make
   this a contained change at the boundary), but the cost is large:
   - every port becomes `async`, so the whole WebSocket coordinator path — kept synchronous on purpose,
     with `selectDeck` as its only `await` — turns async;
   - concurrent confirms from two players on two instances need atomic updates (per-room lock, or
     `WATCH`/`MULTI`, or a Lua script);
   - the janitor must run once per cluster, not once per instance;
   - it overturns the CLAUDE.md rule "game state stays in-memory", which needs an explicit decision.

## Staged plan

### Stage 0 — v1.0 / beta: one instance, on purpose
A turn-based dice game exchanges few messages per player; one instance should comfortably host a beta.
**Measure rather than assume**: concurrent sockets, active rooms, memory, event-loop lag.

The real risk at this size is not load but **deploys: restarting the process kills every match in
progress**. Mitigations, in order of cost:
- graceful drain on `SIGTERM`: stop accepting `createRoom`/`startGame`, let running matches finish (with a
  cap), then exit. Today `main.ts` does not enable Nest shutdown hooks;
- deploy at low-traffic times, and tell clients a maintenance is coming.

### Stage 1 — cheap preparation (worth doing early)
- ~~Client: `transports: ['websocket']`~~ (done in the Flutter client). Check that every target
  network allows WebSockets.
- Keep all state access behind `RoomPort` / `SessionPort` (already the case).
- Add the metrics above (Phase 4 observability).

### Stage 2 — when one instance is not enough: one match = one instance
- Matchmaking (quick-match queue, in Redis) assigns each room to an instance; both players are routed
  there (by room id, at the load balancer or with a redirect). Reconnects go back to the same instance.
- Socket.io Redis adapter and Redis-backed throttler storage for cross-instance traffic (lobby lists,
  notifications, rate limits).
- Game state **stays in-memory** on its instance: almost no change to the game code, the CLAUDE.md rule
  holds.
- Cost: if that instance dies, its matches are lost (same as today).

### Stage 3 — only if matches must survive an instance failure
Externalise room and session state to Redis (section above), with atomic per-room updates and a
cluster-wide janitor. Consider it only with evidence that Stage 2's failure mode is unacceptable.

## Recommendation

Stage 0 for v1.0, with the graceful drain; Stage 1 items as soon as convenient; plan Stage 2 together with
the quick-match queue (Phase 1), since the queue is the natural place to assign rooms to instances.
Stage 3 is not planned.
