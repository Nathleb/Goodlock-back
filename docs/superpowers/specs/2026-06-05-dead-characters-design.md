# Dead Characters — Design

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan

## Goal

Dead characters (`hp <= 0`) stay on the field with their die visible. They cannot
**act** (cannot be the actor that assigns/performs an action), but they can still
be **targeted** by living characters (wasted hits today; room for a future revive
mechanic). The backend is the authority on "dead characters do not act" — the
client cannot make a dead character act.

## Core rule

- **Dead** = `hp <= 0`.
- A dead character: body stays, die stays visible, never acts, remains a valid
  target.

## 1. Backend — source of truth

### Already enforced (keep)
- `unstackPriorityQueueWithLog` (`src/domain/services/PriorityQueue.service.ts`)
  skips any actor with `hp <= 0` via `isAlive`. This is the real guarantee: a dead
  actor never resolves regardless of what the client submits. No change needed
  beyond a test that locks this behavior in.

### Change: `confirmAssignment` skips dead actors
- In `GameCoordinatorService.confirmAssignment`, treat dead characters like
  NONE-constraint faces: **skip them in both the constraint pre-validation loop and
  the apply loop**, so `selectTargetOfCharacter` is never called for a dead
  character.
  - Rationale (a): prevents a *new* stuck of the class just fixed for NONE faces —
    a dead character carrying the frontend's placeholder target could violate its
    face constraint and throw, freezing the room.
  - Rationale (b): guarantees a dead actor carries no action into resolution.
- The skip condition becomes: `targetConstraint === NONE || hp <= 0`.

### Payload contract — unchanged
- Still exactly one entry per character (5). Dead characters' entries are
  placeholders that the backend skips. Keeping the count fixed avoids
  reintroducing the exactly-N fragility that caused the recent resolve-stuck bug.
- **Alternative considered and rejected:** frontend sends living-only entries and
  the backend relaxes the count to "one per living character." Rejected because it
  reintroduces count-mismatch fragility.

### DTO — unchanged
- `CharacterDTO.hp` is already exposed. Frontend derives `dead = hp <= 0`. No new
  field.

## 2. Frontend

### Display dead characters
- `CharacterSlot` already supports a `ko` prop (dims to 0.5, ✖ on portrait, dead HP
  bar, **die/FaceTile still visible**) but no phase panel passes it. Wire
  `ko={char.hp <= 0}` in **KeepPanel** and **AssignPanel** slot renders. This alone
  satisfies "display their die."

### AssignPanel — dead can't act, can still be targeted
- A dead **own** character is **not** selectable as the actor (cannot pick its die
  to assign a target).
- A dead **own** character **is** still selectable as an **ally target** when a
  living actor is selected.
- A dead **enemy** character stays selectable as an **enemy target** (unchanged).
- `allAssigned` gate **excludes dead characters** so the confirm button is not
  blocked waiting on a corpse.
- `handleConfirm` still emits one entry per character; dead characters carry the
  existing placeholder target, which the backend skips.

### KeepPanel — minor consistency
- Dead characters render with `ko` and are **not lockable** (locking a non-acting
  die is meaningless). Small consistency add; can be descoped to Assign-only if
  desired.

## 3. Testing (TDD)

- **Domain:** a dead actor (`hp = 0`) queued for resolution is skipped, produces no
  state change, and yields a `skipped` log step.
- **Application (`GameCoordinator.service.spec`):** `confirmAssignment` with a dead
  character on the team and both players confirming reaches RESOLVE with no error;
  the dead character applies no effect; the game is not stuck. Mirrors the NONE-face
  regression test.
- **Frontend:** no test harness in this repo; verified by build + a live round (dead
  character shows a dimmed die, is not selectable as an actor, is still clickable as
  a target, and does not block confirm).

## Out of scope

- Revive mechanics (the "dead can be targeted" decision leaves the door open but no
  revive effect is implemented here).
- Target-validation changes for dead targets (none needed — dead bodies remain
  valid target positions).
