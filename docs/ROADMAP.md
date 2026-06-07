# Goodlock — Roadmap to v1.0 (mobile-first)

**North star:** a tactical PvP dice game you play on your phone.
**v1.0 target:** a signed, **installable build** (sideload / TestFlight) that two strangers can
download and play a full match on real devices. *Store submission is out of scope for v1.0.*

**Guiding principle — mobile is always prioritized.** Every feature is "done" only when it
works on a real-device build: touch-first UX, portrait layout, ≥44px targets, no hover
dependence, resilient to backgrounding and flaky networks. The online PvP plumbing exists to
serve the phone experience, not the other way around.

---

## Where we are today (baseline)

**Backend (`Goodlock-back`) — engine is built.**
- Domain is genuinely complete: 12 services (GameLoop, Round, Phase, PriorityQueue, Roll, …),
  15 effect strategies (single/cleave/full-team × damage/heal/shield + Push/Swap/MoveToSlot),
  10 character templates. 46 test files.
- Full WS protocol (11 gateway events) covering the whole loop.
- Auth is real: JWT access + refresh tokens, Postgres via Prisma, guards.
- Session reconnect (socketId re-binding), in-memory room/session managers.

**Frontend (`Goodlock-frontend`) — functional, unpolished.**
- React full loop: Login → Lobby → GameScreen + 6 phase panels. Auth/Game/Socket services
  match the backend protocol.
- **Gaps:** 0 tests on `main`; Capacitor only stubbed (`@capacitor/app` + core/cli); no
  animation/juice (Resolve is a static panel); basic UX.

**The honest summary:** the engine is built; the game-as-a-mobile-product around it is not.
*(Phaser migration is paused and parked on branch `phaser-migration` — see Phase 2 gate.)*

---

## Phases

Near-term phases are granular; later phases are coarser and will be re-planned as we approach
them. Each phase has an explicit **exit criterion** measured on a device build.

### Phase 0 — Get on a phone (foundation) ⭐ first
*Establish the mobile feedback loop immediately — nothing later counts until we can feel it on a device.*
- Stand up Capacitor properly (Android first; iOS needs a Mac — see Risks). Make a **repeatable
  build → installable APK** step.
- Responsive/portrait pass on the React UI: the game is 1080×1920 portrait — make it genuinely
  usable on phone sizes; safe-area insets (notch), touch targets, kill any hover-only affordance.
- **Reconnection hardening for mobile:** verify session reconnect survives app
  background/foreground (`@capacitor/app` lifecycle) and network flaps. Phones drop connections
  constantly; this is non-negotiable.
- Re-stand `vitest` on the frontend (it was on the parked branch) + a couple of smoke tests.
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
- **Decision required (CLAUDE.md rule):** introduce the first DB-backed entity beyond auth —
  match **results/history** and basic profile stats, maybe a simple rating/MMR. Live game state
  **stays in-memory**; we persist *outcomes only*, never live state.
- Frontend: profile screen (W/L, recent matches).
- **Exit:** match results saved; profile shows record; matchmaking can use a basic rating.

### Phase 4 — Harden for launch
- Observability (structured logging + minimal metrics), WS rate-limiting, input validation
  audit on all gateway payloads, authz on every event.
- **Scaling story:** in-memory state = single instance. For v1.0, document & accept the ceiling
  (or sticky-session plan) — don't over-build.
- CI for both repos: build + tests on every push; **automated APK build on tag**.
- **Exit:** monitored, rate-limited; CI produces an installable APK from a tag.

### Phase 5 — v1.0 (installable launch)
- First-run onboarding/tutorial (mobile-shaped), app icon + splash, content check (are 10
  characters enough? add a few if shallow).
- Produce the **signed installable build** (sideload / TestFlight) — the agreed v1.0 target.
- Beta with real users on real phones; fix what they hit.
- **Exit:** v1.0 installable build, validated by external testers on their own devices.

---

## Cross-cutting (every phase)
- **Mobile-first:** no feature ships until it's verified on a device build.
- **Tests grow:** frontend coverage increases each phase; backend stays green (46 files today).
- **Reconnection resilience** is maintained as a standing requirement, not a one-time task.

## Open decisions (flagged, not yet made)
1. **Phaser for Resolve** — gated in Phase 2 on real-device performance.
2. **DB-backed results entity** — Phase 3; requires the explicit discussion CLAUDE.md mandates
   before adding any non-auth persistence.
3. **Scaling** — accept single-instance ceiling for v1.0, or invest in sticky sessions now?

## Risks
- **iOS builds need a Mac** (Xcode signing). Android-first keeps Phase 0 unblocked; sequence iOS
  when hardware is available.
- **Single-instance in-memory state** caps concurrency — fine for v1.0/beta, a wall at scale.
- **Solo-dev bandwidth** — phases are sequenced so each ends at something playable on a phone;
  stop-anywhere value.
