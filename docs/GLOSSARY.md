# Glossary: game terms to code

The rules live in `../Goodlock-specs/GAME-DESIGN.md` (read-only from this repo), written in the language of the game. This table maps its terms to the code. Keep it in sync when a name changes on either side.

| Game term (rule IDs) | Code |
|---|---|
| Phases Selection, Placement, Roll, Keep, Resolve, Result (GAME-6) | `GamePhase` (`domain/types/GamePhase.type.ts`) |
| Cell 0 to 4 of a side (GAME-2) | `position.slot`, `BOARD_SIZE` = 5 |
| Priority bracket of a face (PRIO-1) | `DieFace.priority` |
| Base speed (PRIO-1) | `Character.baseSpeed` |
| Initiative token (PRIO-2, PRIO-3) | `GameState.initiativePlayerIndex` |
| Group of cells: side, fixed cells or offsets (TGT-2) | `TargetGroup`: `side` `ALLY`/`ENEMY`, `mode` `ABSOLUTE`/`RELATIVE`, `n` |
| Damage (DMG-1) | `EffectLabel.Damage` |
| Fixed damage (DMG-3) | `EffectLabel.FixedDamage` |
| Heal, Shield, Swap | `EffectLabel.Heal`, `.Shield`, `.Swap` |
| Stat change (STAT-2) | `EffectLabel.ApplyStat`; one bonus or malus is a `Modifier` `{ stat, value, roundsLeft, appliedRound }` |
| Power, Armor (STAT-1) | `STAT_NAMES`: `POWER`, `ARMOR` |
| State (STATE-1) | `EffectLabel.ApplyState`; `STATE_DEFS` (`domain/types/State.type.ts`) |
| Axes Speed, Vitality, Stun, Root, Divine Shield (STATE-1) | `STATE_AXES`: `SPEED`, `VITALITY`, `STUN`, `ROOT`, `DIVINE_SHIELD` |
| Haste, Slow, Regen, Poison, Stun, Root, Divine Shield | `HASTE`, `SLOW`, `REGEN`, `POISON`, `STUN`, `ROOT`, `DIVINE_SHIELD` |
| Max HP, HP, shield | `Character.maxHp`, `.hp`, `.shield` |
| Dead character, off the board (DEAD-1) | `Player.fallen`, in order of death; `Player.team` lists the characters on the board only |
| Winner, no draw (END-1, END-2) | `GameState.winner`, set by `checkMatchEnd` |
| Order of the start-of-round effects (UPK-1) | `startOfRoundOrder` (`domain/services/PriorityQueue.service.ts`) |
