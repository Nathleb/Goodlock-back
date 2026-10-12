# Goodlock — Roadmap to v1.0 (mobile-first)

**North star:** a tactical PvP dice game you play on your phone.
**v1.0 target:** a signed, **installable build** (sideload / TestFlight) that two strangers can
download and play a full match on real devices. *Store submission is out of scope for v1.0.*

**Guiding principle — mobile is always prioritized.** Every feature is "done" only when it
works on a real-device build: touch-first UX, portrait layout, ≥44px targets, no hover
dependence, resilient to backgrounding and flaky networks. The online PvP plumbing exists to
serve the phone experience, not the other way around.

---

## Where we are today (updated 2026-10-12)

**Backend (`Goodlock-back`) — engine and player data are built; ahead of the frontend.**
- Combat: 14 domain services, 4 generic effect strategies (Damage, Heal, Shield, Swap) driven by
  per-effect **auto-targeting** (no ASSIGN phase), **Pokémon-style resolution order** (face priority
  bracket, then base speed, random tiebreak). 10 character templates (placeholder balance).
- **Collection → decks → match entry** (slices A/B/C, Oct 2026): catalog with stable ids loaded at
  boot; `UserCharacter` ownership (grant-all for now); decks of **7**, max 5 per user, starter deck;
  in a room each player picks a deck, then **team preview**: both decks revealed, each secretly keeps
  **5**; the opponent's picks stay hidden until the first ROLL.
- Phases: SELECTION → PLACEMENT → ROLL → KEEP → RESOLVE → RESULT. WS protocol: 13 gateway events.
  REST: `auth/*`, `rooms`, `collection`, `decks`.
- Auth: JWT access + refresh tokens. Postgres via Prisma holds auth + player data (`UserCharacter`,
  `Deck`, `DeckSlot`); live game state stays in-memory. Session reconnect, AFK/forfeit claims.
- 44 test files / 529 tests, lint covers `src/` and `tests/`.
- **Not yet done on a real database:** the two Oct 2026 migrations (`add_user_character`, `add_decks`)
  were generated offline and still need `prisma migrate deploy` + a manual two-client QA.

**Frontend (`Goodlock-frontend`) — behind the backend protocol; the blocker right now.**
- React full loop (Login → Lobby → GameScreen). Capacitor Android is set up with an `android:apk`
  build script; `vitest` is back with ~10 test files — on branch `feat/board-redesign`
  (26 commits ahead of its `main`, last touched 2026-06-18, pending device QA).
- **Still speaks the old protocol** (ASSIGN phase / `selectTarget` / `confirmAssignment`) and knows
  nothing of `selectDeck`, `SELECTION_PHASE`, `/collection`, `/decks`. **It cannot start a match
  against the current backend.**

**The honest summary:** the engine and the player-data backbone exist; the phone experience around
them does not yet, and the frontend must catch up before anything can be played or tested on device.
*(Phaser migration is paused and parked on branch `phaser-migration` — see Phase 2 gate.)*

---

## Phases

Near-term phases are granular; later phases are coarser and will be re-planned as we approach
them. Each phase has an explicit **exit criterion** measured on a device build.

### Phase 0 — Get on a phone (foundation) ⭐ first — IN PROGRESS
*Establish the mobile feedback loop immediately — nothing later counts until we can feel it on a device.*
- **Frontend protocol catch-up (blocking):** auto-targeting (drop ASSIGN), deck choice in the room
  (`selectDeck`), team preview (`SELECTION_PHASE`, `confirmSelection`/`cancelSelection`), empty
  opponent team during PLACEMENT; minimal collection/deck screens over `/collection` and `/decks`.
  Decide whether to land `feat/board-redesign` first.
- Backend side: apply the Oct 2026 migrations and run a two-client QA of deck → preview → match.
- ~~Stand up Capacitor properly~~ (Android done: `npm run android:apk`; iOS needs a Mac — see Risks).
  Keep the **build → installable APK** step repeatable.
- Responsive/portrait pass on the React UI: the game is 1080×1920 portrait — make it genuinely
  usable on phone sizes; safe-area insets (notch), touch targets, kill any hover-only affordance.
- **Reconnection hardening for mobile:** verify session reconnect survives app
  background/foreground (`@capacitor/app` lifecycle) and network flaps. Phones drop connections
  constantly; this is non-negotiable.
- ~~Re-stand `vitest` on the frontend~~ (done on `feat/board-redesign`; merge it).
- **Exit:** an installable APK that plays a full match on a real phone and survives
  backgrounding + a network blip mid-match.

### Phase 1 — Matchmaking (two strangers can actually play)
- Backend: a **quick-match queue** on top of the existing room system (in-memory queue manager,
  consistent with the architecture); keep room-codes for friends.
- Frontend: mobile lobby with "Quick Match" + "Play with a friend (code)".
- Polished **game-over → rematch / back-to-lobby** flow (mobile-shaped).
- **Exit:** tap Quick Match on two phones → matched → full game → rematch, all on device.

### Phase 2 — Make it feel good on device (the juice)
- **Resolve-phase animation.** This is the decision gate for Phaser: prototype the Resolve
  animation *in isolation* (recover from branch `phaser-migration`). **Judge it on-device
  performance.** If Phaser earns its weight there, use it **only** for Resolve; otherwise do it
  with CSS/lightweight canvas. (Input phases stay React — that lesson is already paid for.)
- UX polish: transitions, clear feedback, haptics (`@capacitor/haptics`), optional sound.
- Readability on small screens.
- **Exit:** a match *feels* good on a phone; the Resolve reads clearly with motion at a smooth
  frame rate on a mid-range device.

### Phase 3 — Persistence & progression (retention)
- *Player-data persistence already exists (collection, decks — Oct 2026).* **Decision still required
  (CLAUDE.md rule)** for match **results/history** and basic profile stats, maybe a simple rating/MMR. Live game state
  **stays in-memory**; we persist *outcomes only*, never live state.
- Replace the temporary grant-all and auto starter deck with real **acquisition** (rewards, unlocks).
- Frontend: profile screen (W/L, recent matches).
- **Exit:** match results saved; profile shows record; matchmaking can use a basic rating.

### Phase 4 — Harden for launch
- Observability (structured logging + minimal metrics), WS rate-limiting, input validation
  audit on all gateway payloads (check whether the global `ValidationPipe` actually applies to the
  WebSocket gateway; coordinators re-validate sensitive inputs meanwhile), authz on every event.
- Test debt: gateway handlers are thinly covered (~33%), no end-to-end tests yet.
- **Scaling (see [`docs/SCALING.md`](SCALING.md)):** in-memory state = single instance. For v1.0,
  run **one instance on purpose** and measure (sockets, rooms, memory, event-loop lag).
  - **Graceful drain on deploy** (the real v1.0 risk: a restart kills every match in progress):
    enable Nest shutdown hooks, refuse new rooms/starts on `SIGTERM`, let running matches finish.
  - Cheap prep: client on `transports: ['websocket']` (no long-polling → no sticky sessions needed
    just to keep a connection).
  - Multi-instance later = **one match per instance** (rooms assigned by the quick-match queue,
    Socket.io Redis adapter + Redis throttler storage); game state stays in-memory. Externalising
    game state to Redis is not planned.
- CI for both repos: build + tests on every push; **automated APK build on tag**.
- **Exit:** monitored, rate-limited; a deploy no longer kills running matches; CI produces an
  installable APK from a tag.

### Phase 5 — v1.0 (installable launch)
- First-run onboarding/tutorial (mobile-shaped), app icon + splash, content pass (10 placeholder
  characters today; with decks of 7 and a pick of 5 the roster needs depth and real balance).
- Produce the **signed installable build** (sideload / TestFlight) — the agreed v1.0 target.
- Beta with real users on real phones; fix what they hit.
- **Exit:** v1.0 installable build, validated by external testers on their own devices.

---

## Cross-cutting (every phase)
- **Mobile-first:** no feature ships until it's verified on a device build.
- **Tests grow:** frontend coverage increases each phase; backend stays green (44 files / 529 tests today).
- **Reconnection resilience** is maintained as a standing requirement, not a one-time task.

## Open decisions (flagged, not yet made)
1. **Phaser for Resolve** — gated in Phase 2 on real-device performance.
2. **DB-backed results entity** — Phase 3; requires the explicit discussion CLAUDE.md mandates
   before adding any new persistence (collection and decks were agreed in Oct 2026).
4. **Items** — will attach to deck slots (`DeckSlot`), design not started.
5. **`Result<T, E>`** — the convention exists in CLAUDE.md but the type is not implemented; adopt it in
   a dedicated change or drop the convention.
3. **Scaling** — proposed in [`docs/SCALING.md`](SCALING.md): single instance + graceful drain for
   v1.0; one-match-per-instance with Redis for cross-instance traffic when needed. Awaiting sign-off.

## Risks
- **iOS builds need a Mac** (Xcode signing). Android-first keeps Phase 0 unblocked; sequence iOS
  when hardware is available.
- **Single-instance in-memory state** caps concurrency — fine for v1.0/beta, a wall at scale.
- **Protocol drift:** the backend moved three slices ahead of the frontend; every protocol change
  now lands with a note of what the client must do, and the frontend catch-up is Phase 0's first item.
- **Solo-dev bandwidth** — phases are sequenced so each ends at something playable on a phone;
  stop-anywhere value.
