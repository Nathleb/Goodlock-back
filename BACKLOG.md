# Backlog

## Known deferred (agreed to defer explicitly)
- [ ] Payload validation on all gateway events (every `@SubscribeMessage` handler)
- [ ] Auth / accounts / persistence (no database yet, all state in-memory)

## Domain gaps
- [ ] `modifiers: []` on Character — the type exists, no modifier effects implemented
- [ ] No way to restart a match after `gameOver` without both clients reconnecting
- [ ] Post-`gameOver` game actions are silently ignored (assertPhase throws → error emitted) — consider a cleaner `GAME_OVER` phase guard

## Infrastructure gaps
- [ ] CORS origin hardcoded to `*` in `SessionGateway` — should come from config
- [ ] No rate limiting on WebSocket events
- [ ] Template loading in `GameCoordinator.startGame` reads from disk on every game start — could be cached at startup

## Competitive correctness
- [ ] `GameStateDTO` exposes all targets to both players — during ASSIGN phase, each player should only see their own targeting choices, not the opponent's

## Matchmaking (future)
- [ ] Replace manual `createRoom` / `joinRoom` with a matchmaking queue
- [ ] `startGame` triggered automatically when match is found, not by the room owner
