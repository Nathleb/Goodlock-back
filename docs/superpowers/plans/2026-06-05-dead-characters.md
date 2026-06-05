# Dead Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dead characters (`hp <= 0`) stay on the field with their die visible, can still be targeted by the living, but cannot act — enforced by the backend.

**Architecture:** The backend already skips dead actors during resolution (`isAlive` in `PriorityQueue.service`). This plan (1) makes `confirmAssignment` skip dead actors so a dead character's placeholder target can never throw and stall the round, and (2) wires the existing `CharacterSlot` `ko` styling into the Keep and Assign panels and blocks dead characters from being selected as the acting die.

**Tech Stack:** NestJS + TypeScript (backend, Jest), React + TypeScript (frontend `Goodlock-frontend`, no test harness — verified by `tsc`/lint/live run).

**Repos:**
- Backend: `/home/lebih/projects/Goodlock-back`
- Frontend: `/home/lebih/projects/Goodlock-frontend`

---

## File Structure

- `src/application/services/GameCoordinator.service.ts` (backend, modify) — skip dead actors in `confirmAssignment`.
- `tests/GameCoordinator.service.spec.ts` (backend, modify) — regression test for the dead-actor skip.
- `Goodlock-frontend/src/game/phases/AssignPanel.tsx` (frontend, modify) — dead display, block dead-as-actor, exclude dead from the confirm gate.
- `Goodlock-frontend/src/game/phases/KeepPanel.tsx` (frontend, modify) — dead display, non-lockable dead.
- `CharacterSlot.tsx` — **no change** (already supports `ko`).

**Already covered, do not re-add:** the domain guarantee "a dead actor is skipped in resolution and marked `skipped`" is tested in `tests/PriorityQueue.service.spec.ts:59` ("should cancel effects from dead actors and mark them skipped in the log"). No new domain test.

---

## Task 1: Backend — `confirmAssignment` skips dead actors

**Files:**
- Modify: `src/application/services/GameCoordinator.service.ts`
- Test: `tests/GameCoordinator.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `tests/GameCoordinator.service.spec.ts`, inside the `describe('confirmAssignment', ...)` block (after the existing "does not get stuck" NONE test, near line 358), add:

```typescript
    it('resolves (does not get stuck) when a dead character would otherwise fail target validation', () => {
        const allyDie = generateFullDie([
            { description: 'AllyHeal', priority: 1, effects: [], targetConstraint: TargetConstraint.ALLY_ONLY },
            { description: 'B', priority: 1, effects: [] },
            { description: 'C', priority: 1, effects: [] },
            { description: 'D', priority: 1, effects: [] },
            { description: 'E', priority: 1, effects: [] },
            { description: 'F', priority: 1, effects: [] },
        ] satisfies BaseDieInstructions, factory);
        // char[0] is dead (hp 0) and has an ALLY_ONLY face; the frontend default targets an enemy,
        // which would violate ALLY_ONLY for a living actor. A dead actor must be skipped instead.
        const team = createPlayer(
            [0, 1, 2, 3, 4].map(i =>
                createCharacter('C', i === 0 ? 0 : 100, 1, i === 0 ? allyDie : die, { playerIndex: 0, slot: i as SlotIndex }),
            ),
            0,
        );
        const deadGs = beginAssignPhase(createGameState(team, makeTeam(1)));
        // player 1 already ready — player 0 confirms second, triggering resolution.
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(deadGs)));
        coordinator.confirmAssignment(SOCKET_0, makeTargets(deadGs));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.anything());
        expect(mockWs.emitToSocket).not.toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/GameCoordinator.service.spec.ts -t "dead character would otherwise"`
Expected: FAIL — `roundResolved` has 0 calls (the dead ALLY_ONLY char's enemy placeholder target throws `'ALLY_ONLY constraint violated...'` in the pre-validation loop, so resolution never runs).

- [ ] **Step 3: Implement — import `isDead` and skip dead actors in both loops**

In `src/application/services/GameCoordinator.service.ts`, add `isDead` to the existing `Character.service` import. Find the import line (it currently imports `createPlayer, rearrangeTeam, selectTargetOfCharacter` from `Player.service`); add a new import near it:

```typescript
import { isDead } from '@domain/services/Character.service';
```

In `confirmAssignment`, the **pre-validation loop** currently reads:

```typescript
        // Validate each target against the character's face constraint
        for (const entry of targets) {
            const char = player.team.find(c => c.id === entry.characterId)!;
            if (char.face.targetConstraint === TargetConstraint.NONE) continue;
```

Change the guard to also skip dead characters:

```typescript
        // Validate each target against the character's face constraint
        for (const entry of targets) {
            const char = player.team.find(c => c.id === entry.characterId)!;
            if (char.face.targetConstraint === TargetConstraint.NONE || isDead(char)) continue;
```

In the same method, the **apply loop** currently reads:

```typescript
            let updatedPlayer = player;
            for (const entry of targets) {
                const char = updatedPlayer.team.find(c => c.id === entry.characterId)!;
                if (char.face.targetConstraint === TargetConstraint.NONE) continue;
```

Change its guard the same way:

```typescript
            let updatedPlayer = player;
            for (const entry of targets) {
                const char = updatedPlayer.team.find(c => c.id === entry.characterId)!;
                if (char.face.targetConstraint === TargetConstraint.NONE || isDead(char)) continue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/GameCoordinator.service.spec.ts`
Expected: PASS — all confirmAssignment tests green, including the new one.

- [ ] **Step 5: Run the full backend suite**

Run: `npm test`
Expected: all suites pass (was 296; now 297 with the new test).

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no *new* errors in `GameCoordinator.service.ts` (the 11 pre-existing errors in other files are unrelated and out of scope).

- [ ] **Step 7: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts tests/GameCoordinator.service.spec.ts
git commit -m "feat: skip dead characters in confirmAssignment so dead actors carry no action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Frontend — AssignPanel displays dead, blocks them as actors

**Files:**
- Modify: `Goodlock-frontend/src/game/phases/AssignPanel.tsx`

No unit tests (no frontend harness); verification is `tsc` + lint + live run.

- [ ] **Step 1: Block dead characters from being selected as the actor**

In `handleMyClick`, the current body is:

```typescript
  const handleMyClick = (char: CharacterDTO) => {
    if (localReady) return;
    if (selectedMyId && (constraint === 'ALLY_ONLY' || constraint === 'ANY')) {
      setTarget(selectedMyId, { playerIndex: char.position.playerIndex, slot: char.position.slot });
      setSelectedMyId(null);
      setSelectedEnemyId(null);
      return;
    }

    setSelectedEnemyId(null);
    const isSame = selectedMyId === char.id;
    setSelectedMyId(isSame ? null : char.id);
  };
```

Insert a dead-actor guard **after** the target-assignment branch and **before** the actor-selection lines, so a dead ally can still be chosen as a target but never as the actor:

```typescript
  const handleMyClick = (char: CharacterDTO) => {
    if (localReady) return;
    if (selectedMyId && (constraint === 'ALLY_ONLY' || constraint === 'ANY')) {
      setTarget(selectedMyId, { playerIndex: char.position.playerIndex, slot: char.position.slot });
      setSelectedMyId(null);
      setSelectedEnemyId(null);
      return;
    }

    if (char.hp <= 0) return; // dead characters cannot act

    setSelectedEnemyId(null);
    const isSame = selectedMyId === char.id;
    setSelectedMyId(isSame ? null : char.id);
  };
```

- [ ] **Step 2: Exclude dead characters from the confirm gate**

The current gate:

```typescript
  const allAssigned = myTeam.every(
    (c) => c.face.targetConstraint === 'NONE' || localTargets.has(c.id),
  );
```

Change to also exempt dead characters (they never need a target):

```typescript
  const allAssigned = myTeam.every(
    (c) => c.hp <= 0 || c.face.targetConstraint === 'NONE' || localTargets.has(c.id),
  );
```

- [ ] **Step 3: Show the KO styling on both teams' dead slots**

In `renderEnemySlot`, add the `ko` prop to the `CharacterSlot`:

```tsx
      renderEnemySlot={(char) => (
        <CharacterSlot
          key={char.id}
          char={char}
          selectable={enemySelectable}
          selected={selectedEnemyId === char.id}
          ko={char.hp <= 0}
          onClick={() => handleEnemyClick(char)}
          targetLabel={getTargetLabel(char, localTargets, [...myTeam, ...enemyTeam])}
        />
      )}
```

In `renderMySlot`, add the `ko` prop:

```tsx
      renderMySlot={(char) => (
        <CharacterSlot
          key={char.id}
          char={char}
          selectable
          selected={selectedMyId === char.id}
          ko={char.hp <= 0}
          onClick={() => handleMyClick(char)}
          targetLabel={getTargetLabel(char, localTargets, [...myTeam, ...enemyTeam])}
        />
      )}
```

- [ ] **Step 4: Type-check and lint**

Run (in `/home/lebih/projects/Goodlock-frontend`): `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/lebih/projects/Goodlock-frontend
git add src/game/phases/AssignPanel.tsx
git commit -m "feat: show dead characters in assign phase and block them as actors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend — KeepPanel displays dead, makes them non-lockable

**Files:**
- Modify: `Goodlock-frontend/src/game/phases/KeepPanel.tsx`

- [ ] **Step 1: Make dead own-characters non-interactive and show KO**

The current `renderMySlot`:

```tsx
      renderMySlot={(char) => (
        <CharacterSlot
          key={char.id}
          char={char}
          selectable
          selected={selectedMyId === char.id}
          locked={lockedIds.has(char.id)}
          onClick={() => handleMyClick(char.id)}
        />
      )}
```

Replace with a version that disables interaction for dead characters (no lock toggle, no selection) and shows the KO styling:

```tsx
      renderMySlot={(char) => (
        <CharacterSlot
          key={char.id}
          char={char}
          selectable={char.hp > 0}
          selected={selectedMyId === char.id}
          locked={lockedIds.has(char.id)}
          ko={char.hp <= 0}
          onClick={char.hp > 0 ? () => handleMyClick(char.id) : undefined}
        />
      )}
```

- [ ] **Step 2: Show KO on dead enemy slots**

The current `renderEnemySlot`:

```tsx
      renderEnemySlot={(char) => (
        <CharacterSlot
          key={char.id}
          char={char}
          selectable
          selected={selectedEnemyId === char.id}
          locked={char.isFaceLocked}
          onClick={() => handleEnemyClick(char.id)}
        />
      )}
```

Replace with one that adds the KO styling (enemy dead slots stay previewable):

```tsx
      renderEnemySlot={(char) => (
        <CharacterSlot
          key={char.id}
          char={char}
          selectable
          selected={selectedEnemyId === char.id}
          locked={char.isFaceLocked}
          ko={char.hp <= 0}
          onClick={() => handleEnemyClick(char.id)}
        />
      )}
```

- [ ] **Step 3: Type-check and lint**

Run (in `/home/lebih/projects/Goodlock-frontend`): `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/lebih/projects/Goodlock-frontend
git add src/game/phases/KeepPanel.tsx
git commit -m "feat: show dead characters as KO and non-lockable in keep phase

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Live verification

- [ ] **Step 1: Run a real game to a point where a character dies**

Start backend (`npm run start:dev`) and frontend, play until at least one character on each team reaches 0 HP (e.g. let a `FullTeamDamage` / focused attacks kill a slot).

- [ ] **Step 2: Confirm the dead-character behaviors**

Verify, in both Keep and Assign phases:
- The dead character's **die is still visible** (dimmed, ✖ on the portrait, dead HP bar).
- In Assign, the dead character **cannot be selected as the acting die** (clicking it while no actor is selected does nothing).
- In Assign, the dead character **can still be clicked as a target** when a living ally/any actor is selected, and a living enemy can target a dead enemy.
- The **confirm button is not blocked** by the dead character (it enables once all *living* non-NONE characters have targets).
- Both players confirm → the round **reaches RESOLVE**, and the dead character produces no action.

---

## Self-Review

- **Spec coverage:**
  - "Display die" → Task 2 Step 3, Task 3 Steps 1–2 (`ko` wiring; FaceTile stays visible).
  - "Dead can't act / not selectable as actor" → Task 2 Step 1 (Assign), Task 3 Step 1 (Keep).
  - "Dead can still be targeted" → Task 2 Step 1 keeps the target-assignment branch ahead of the dead guard; enemy dead stay selectable.
  - "Backend is source of truth" → Task 1 (skip in `confirmAssignment`) + existing resolution `isAlive` skip (already tested, noted in File Structure).
  - "Body stays on field" → no removal logic anywhere; dead characters remain in `team`.
  - "Confirm not blocked by corpse" → Task 2 Step 2.
- **Placeholder scan:** none — all steps contain concrete code and commands.
- **Type consistency:** `isDead(char)` matches `Character.service.isDead(character: Character): boolean`; `ko` matches the existing `CharacterSlotProps.ko?: boolean`; `char.hp` is on `CharacterDTO`. Payload shape unchanged, so backend/frontend contract stays aligned.
