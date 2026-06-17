# Pokemon-style Speed System — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)
**Branch:** fix/confirm-ready-echo (TBD: dedicated branch)

## Problem

Resolution order currently fuses two concepts into one number:

```ts
finalPriority = face.priority + character.baseSpeed   // index into a 100-slot array
```

A slow character on a high-priority face outruns a fast character on a low-priority
face, because face priority and character speed are added on the same axis. The fixed
100-length queue also forces a bounds guard and makes negative priorities impossible.

## Goal (Pokemon model)

Two independent axes:

- **Speed** is the character's stat and the *primary* ordering key.
- A move's **priority** is a small bracket modifier.
- Resolution: sort by priority bracket first; **within the same bracket**, the faster
  character acts first. Speed never crosses brackets.

A `+1` move always resolves before any `0` move regardless of speed; two `0` moves
resolve fastest-first; equal bracket *and* equal speed → random order.

## Decisions

- **Per-face `priority` stays an explicit, hand-authored field** (full control; a `+2`
  attack or a `-1` heavy attack are both legal).
- **Tiebreak within equal (bracket, speed): random.**
- **Scope: engine + full template re-tune** (all 10 `tmplt/*.json`).
- **baseSpeed: widened a lot** so within-bracket order is decisive and distinct,
  preserving the current relative fast/slow ordering between characters.
- **Movement bracket: +1** (ties with shield/heal, only beats attacks).

## Section 1 — Ordering engine

Approach **A — flat list + comparator** (chosen over bucket-by-bracket and
minimal-patch alternatives).

- `addAllEffectsToPriorityQueue` collects a **flat list** of entries, each tagged with
  its `priority` bracket and the actor's `speed`.
- `unstackPriorityQueueWithLog`:
  1. Fisher-Yates shuffle the flat list (fairness).
  2. **Stable-sort** by `priority` desc, then `speed` desc.
  3. Equal `(bracket, speed)` keep shuffled order → random tiebreak for free.
  4. Resolve top to bottom (existing per-entry resolution logic unchanged).

Type/representation impact:

- `QueueEntry` gains the actor's `speed` (entry is self-contained for sorting).
- `PriorityQueue` becomes `readonly QueueEntry[]` (flat, was `QueueEntry[][]`).
- `createPriorityQueue` no longer takes a length; `GameInit` drops the `100` arg.
- The `finalPriority` bounds guard / out-of-range error is **removed** (no longer
  index-based). Negative and arbitrary integer brackets are naturally supported.
- `DieFace.priority` type unchanged — semantics change only (now a bracket modifier).

The `ResolveStep` log shape is unchanged, so application/infrastructure/frontend are
untouched.

## Section 2 — Template re-tuning convention

Baseline bracket by effect family:

| Family            | Bracket |
|-------------------|---------|
| Damage (attack)   | 0       |
| Heal              | +1      |
| Shield            | +1      |
| Movement (push)   | +1      |

Rules:

- A face's bracket reflects its *primary intent*; deviate per-face for interesting
  speed-vs-priority choices (heavy attack → `-1` "goes last"; quick jab → `+1`; slow
  fortress shield → `0`).
- **Mixed faces** take the bracket of their lead/intent effect: "deal 6 dmg + gain
  2 shield" → attack `0`; "deal 3 dmg + heal self" → `0`. Movement, if present and
  intended, wins.
- Each character's 6 faces should vary brackets so face choice is a real decision.

baseSpeed: widen a lot (preserving current relative ordering between characters).
Exact per-character numbers proposed in the implementation plan.

Effect families present in templates:

- Damage: SingleTargetDamage, CleaveDamage, FullTeamDamage, SelfDamage
- Heal: SingleTargetHeal, CleaveHeal, FullTeamHeal, SelfHeal
- Shield: SingleTargetShield, CleaveShield, FullTeamShield, SelfShield
- Movement: PushLeft, PushRight

## Section 3 — Testing (TDD, domain-first)

- **PriorityQueue.service.spec** (rewritten):
  - higher bracket before lower bracket regardless of speed;
  - within a bracket, higher speed first;
  - equal bracket + equal speed → both resolve, order non-deterministic (assert set
    membership, not order);
  - negative brackets resolve last;
  - dead-actor skip preserved.
- **Template integrity spec**: every template parses; every face `priority` within a
  sane range; brackets present. Guards the JSON re-tune.
- Existing GameLoop / resolve tests stay green (log shape unchanged).

No application/infrastructure changes.

## Out of scope

- No DTO, gateway, or frontend changes.
- No new effects, strategies, or characters.
- No persistence changes (game state remains in-memory).
