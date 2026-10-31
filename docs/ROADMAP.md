# Goodlock — Roadmap to v1.0 (mobile-first)

**North star:** a tactical PvP dice game you play on your phone.
**Backlog:** this roadmap is the only backlog (the old `BACKLOG.md` was folded into it on
2026-10-20). Deferred work goes in the phase it belongs to, open questions under *Open decisions*.

**v1.0 target:** a signed, **installable build** (sideload / TestFlight) that two strangers can
download and play a full match on real devices. *Store submission is out of scope for v1.0.*

**Guiding principle — mobile is always prioritized.** Every feature is "done" only when it
works on a real-device build: touch-first UX, forced landscape layout, ≥44px targets, no hover
dependence, resilient to backgrounding and flaky networks. The online PvP plumbing exists to
serve the phone experience, not the other way around.

---

## Where we are today (updated 2026-10-19)

**Backend (`Goodlock-back`) — engine and player data are built; ahead of the client.**
- Combat: generic effect strategies (Damage, FixedDamage, Heal, Shield, Swap, ApplyStat, ApplyState) driven by
  per-effect **auto-targeting** (no ASSIGN phase), **Pokémon-style resolution order** (face priority
  bracket, then base speed, then an alternating initiative token and slot). Character templates are untuned (balance comes from simulation).
- **Collection → decks → match entry** (slices A/B/C, Oct 2026): catalog with stable ids loaded at
  boot; `UserCharacter` ownership (grant-all for now); decks of **6**, max 5 per user, starter deck;
  in a room each player picks a deck, then **team preview**: both decks revealed, each secretly keeps
  **4**; the opponent's picks stay hidden until the first ROLL.
- **Four of six** (Oct 19 2026): deck 6, keep 4, 5-cell board with one empty cell chosen at placement
  (Swap moves into it), defeat at 2 dead. See `docs/features/implemented/2026-10-19-four-of-six/`.
- Phases: SELECTION → PLACEMENT → ROLL → KEEP → RESOLVE → RESULT.
  REST: `auth/*`, `rooms`, `collection`, `decks`.
- Auth: JWT access + refresh tokens. Postgres via Prisma holds auth + player data (`UserCharacter`,
  `Deck`, `DeckSlot`); live game state stays in-memory. Session reconnect, AFK/forfeit claims.

**Client (`Goodlock-app`, Oct 2026) — Flutter + Flame prototype.**
- Chosen for the most UI + mobile game-feel headroom (TypeScript was not a criterion). Talks to the
  unchanged Socket.IO backend; a headless two-bot match (`tool/bot_match.dart`) plays full games
  end to end and doubles as the protocol QA.
- Has: login (runtime server URL), collection, deck editor, an animated Flame Resolve scene (impacts,
  floating numbers, shakes, hit-stop, haptics), an offline demo of a recorded match and a live
  two-bot match. **On-device verdict (2026-10-19): positive on the offline demo** (release APK); Flutter + Flame is kept. Not yet: human input for team preview,
  placement and dice (the live screen only watches bots).
- Backend additions made for it: `sessionStarted { sessionId }` on connect (clients find their seat
  in `room.players` instead of guessing creator=0), and `catalogId` on in-match characters.

*The legacy React client (`Goodlock-frontend`) was deleted on 2026-10-19; Flutter + Flame is the only client.*

**The honest summary:** the engine and the player-data backbone exist; the phone experience around
them does not yet: the client must gain human input before anything can be played on device.

---

## Phases

Near-term phases are granular; later phases are coarser and will be re-planned as we approach
them. Each phase has an explicit **exit criterion** measured on a device build.

### Phase 0 — Get on a phone (foundation) ⭐ first — IN PROGRESS
*Establish the mobile feedback loop immediately — nothing later counts until we can feel it on a device.*
- **Client:** validate the Flutter + Flame prototype on a phone, then build the human-input
  phases (team preview, placement, dice keep) and a real lobby in `Goodlock-app`.
- ~~Backend side: apply the Oct 2026 migrations and run a two-client QA~~ (done Oct 13: migrations applied, no schema drift; REST rules and full bot matches verified).
- Keep the **build → installable APK** step repeatable (`flutter build apk`; iOS needs a Mac — see Risks).
- ~~Forced landscape~~ (done Oct 19 2026: whole app, board in two facing columns). Still: safe-area insets (notch) on real phones, touch targets ≥44px.
- **Reconnection hardening for mobile:** verify session reconnect survives app
  background/foreground (Flutter `AppLifecycleState`) and network flaps. Phones drop connections
  constantly; this is non-negotiable.
- **Exit:** an installable APK that plays a full match on a real phone and survives
  backgrounding + a network blip mid-match.

### Phase 1 — Matchmaking (two strangers can actually play)
- Backend: a **quick-match queue** on top of the existing room system (in-memory queue manager,
  consistent with the architecture); keep room-codes for friends. A found match starts the game
  by itself (today the room owner sends `startGame`).
- Client: mobile lobby with "Quick Match" + "Play with a friend (code)".
- Polished **game-over → rematch / back-to-lobby** flow (mobile-shaped).
- **Exit:** tap Quick Match on two phones → matched → full game → rematch, all on device.

### Phase 2 — Make it feel good on device (the juice)
- **Resolve-phase animation:** the Flame Resolve scene exists in the prototype; judge and tune it
  on-device performance.
- UX polish: transitions, clear feedback, haptics, optional sound.
- Readability on small screens.
- **Exit:** a match *feels* good on a phone; the Resolve reads clearly with motion at a smooth
  frame rate on a mid-range device.

### Phase 3 — Persistence & progression (retention)
- *Player-data persistence already exists (collection, decks — Oct 2026).* **Decision still required
  (CLAUDE.md rule)** for match **results/history** and basic profile stats, maybe a simple rating/MMR. Live game state
  **stays in-memory**; we persist *outcomes only*, never live state.
- Replace the temporary grant-all and auto starter deck with real **acquisition** (rewards, unlocks).
- Client: profile screen (W/L, recent matches).
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
  - ~~Cheap prep: client on `transports: ['websocket']`~~ (done: the Flutter client is
    WebSocket-only, no sticky sessions needed just to keep a connection).
  - Multi-instance later = **one match per instance** (rooms assigned by the quick-match queue,
    Socket.io Redis adapter + Redis throttler storage); game state stays in-memory. Externalising
    game state to Redis is not planned.
- CI for both repos: build + tests on every push; **automated APK build on tag**.
- **Exit:** monitored, rate-limited; a deploy no longer kills running matches; CI produces an
  installable APK from a tag.

### Phase 5 — v1.0 (installable launch)
- First-run onboarding/tutorial (mobile-shaped), app icon + splash, content pass (six
  authored characters today; with decks of 6 and a pick of 4 the roster needs depth and real balance).
- Produce the **signed installable build** (sideload / TestFlight) — the agreed v1.0 target.
- Beta with real users on real phones; fix what they hit.
- **Exit:** v1.0 installable build, validated by external testers on their own devices.

---

## Cross-cutting (every phase)
- **Mobile-first:** no feature ships until it's verified on a device build.
- **Tests grow:** client coverage increases each phase; backend stays green.
- **Reconnection resilience** is maintained as a standing requirement, not a one-time task.

## Dice authoring and statuses (backend, done)

Umbrella design: `docs/features/implemented/2026-10-26-dice-authoring-and-statuses/design.md`. Shipped: deterministic
initiative, `FixedDamage`, POWER and ARMOR, the five states (STUN, ROOT, DIVINE_SHIELD, POISON/REGEN, HASTE/SLOW) and the
six-character roster. Still to do: an animated upkeep log (the poison HP drop is only visible in the next state),
`DIE_LOCK` (acts on the keep decision), a player-set tie preset within a team, client badges for stats and states
(the models already parse `modifiers`, `stats` and `states`), the client resolution preview as a simulation of the
resolution, balancing by simulation, and **triggers** ("flee when hit", riposte), which need their own system.

---

## Open decisions (flagged, not yet made)
1. **DB-backed results entity** — Phase 3; requires the explicit discussion CLAUDE.md mandates
   before adding any new persistence (collection and decks were agreed in Oct 2026).
2. **Items** — will attach to deck slots (`DeckSlot`), design not started.
3. **`Result<T, E>` on the HTTP side** — the WebSocket path now returns `Result<T, DomainError>`
   (see CLAUDE.md, "Errors"); the HTTP coordinators (auth, collection, decks) still throw Nest exceptions
   from `application/`. Move them to the same scheme, or keep them as the HTTP edge's own convention.
4. **Scaling** — proposed in [`docs/SCALING.md`](SCALING.md): single instance + graceful drain for
   v1.0; one-match-per-instance with Redis for cross-instance traffic when needed. Awaiting sign-off.

## Risks
- **iOS builds need a Mac** (Xcode signing). Android-first keeps Phase 0 unblocked; sequence iOS
  when hardware is available.
- **Single-instance in-memory state** caps concurrency — fine for v1.0/beta, a wall at scale.
- **Protocol drift:** every protocol change lands with a note of what the client must do.
- **Solo-dev bandwidth** — phases are sequenced so each ends at something playable on a phone;
  stop-anywhere value.
