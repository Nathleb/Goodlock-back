# Initiative — plan

**Status:** approved 2026-10-26, in progress.

Layers: domain (state, init, round end, sort), application (DTO + mapper). No new port, adapter, branded ID, effect or template. Nothing here can fail, so no new error path.

Each step: red test first, minimum code, tests green, one commit.

- [ ] 0. Docs: this spec and plan, the umbrella design with its templates, ROADMAP feature sequence.
- [ ] 1. Domain, initiative drawn at init. Red: `createSelectionState` with `Math.random` at 0.2 gives `initiativePlayerIndex` 0, at 0.7 gives 1. Code: field in `GameState.type.ts`, `roll1D(2)` in `createSelectionState`, optional `initiative` argument (default 0) on `createGameState`; fixtures get the field.
- [ ] 2. Domain, initiative flips at end of round. Red: `endOfRound` turns 0 into 1 and 1 into 0 (`tests/Round.service.spec.ts`).
- [ ] 3. Domain, ties across teams go to the initiative holder. Red (`tests/PriorityQueue.service.spec.ts`): equal bracket and speed on both sides, the holder resolves first for both values; initiative never beats speed or bracket; `Math.random` is not called while resolving. Code: `orderedForResolution(queue, state)` as a pure sort, `shuffled` deleted.
- [ ] 4. Domain, ties within one team go by slot ascending. Red: two allies with equal bracket and speed whose array order does not match their slots. Code: slot key in the comparator; an actor missing from the state keeps its queue order.
- [ ] 5. Application, initiative in the public DTO. Red (`tests/GameStateMapper.viewer.spec.ts`): present in `toDTO` and in every `toDTOForViewer` phase. Code: `GameState.dto.ts`, `GameStateMapper.toDTO`.
- [ ] 6. Client mirror in Goodlock-app (subagent, branch `feat/initiative` from `feat/landscape`): `initiativePlayerIndex` in `lib/net/models.dart`, tolerant when absent so the recorded demo still parses. `flutter analyze` and `flutter test`.
- [ ] 7. Docs to current behavior: `CLAUDE.md` rule 4 and the Randomness convention, the pokemon-speed and auto-targeting specs, ROADMAP, the stale "randomised" comment in `tests/DomainIntegration.spec.ts`.

After the steps: FULL review, then implemented/, memory, push and PR.
