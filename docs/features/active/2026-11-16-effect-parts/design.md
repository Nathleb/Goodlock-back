# Effect parts: design

## Why

The rules reference says an effect is its target cells plus an ordered list of parts (Glossary,
SEQ-1, TGT-2, TGT-4, DMG-1, STATE-6, SWAP-1, DEAD-1, DEAD-3). The code has a flat effect: one
label, one magnitude, its targets. This feature makes faces authored, resolved, logged and sent
with parts.

Out of scope: the timeline and die view in the app, and any change to the specs space.

## Shape

The same shape in `tmplt/*.json`, the domain, the DTOs and the resolution log:

```json
{ "targets": [{ "side": "ENEMY", "mode": "RELATIVE", "n": [0] }],
  "parts": [{ "part": "Damage", "magnitude": 15 },
            { "part": "ApplyState", "state": "POISON", "duration": 2 }] }
```

- Domain: `FacePart = { label, magnitude, stat?, state?, duration? }`,
  `FaceEffect = { targets, parts }`.
- Log: `ResolvedEffect = { parts: EffectLabel[], targets }`.
- `EffectLabel` and `effectFor` keep their names: they now name a part and its strategy.

## Resolution of one effect

For each cell occurrence, in order, each part applies in order. Deaths settle once, after the
effect. A Swap is the only part of its effect, checked at catalog load.

## Readings the rules leave open

Accepted by the user as settled by character design; no rule test pins them.

- Each part reads the board as everything applied before it left it (Power and Armor included).
- Divine Shield triggers when a Damage part, at the moment it applies, would deal more than 0. The
  character goes back to what it was before the effect, minus the state, and the effect skips it
  for the rest of its cells.

## Layers

Domain, then application. No new port, adapter, branded ID, error code or effect label. Authoring
errors stay thrown `Error`s at catalog load.
