# Plan: keep preview

- [ ] 1. Domain: `previewRound` returns the log of `performResolve` on the same faces; refuses outside KEEP;
      ignores locks (tests in `tests/GameLoop.service.spec.ts`).
- [ ] 2. Application: `GameStateDTO.preview`, filled by `GameStateMapper.toDTO` in KEEP only; run
      `npm run protocol:schema` (tests in `tests/GameStateMapper.preview.spec.ts`).
- [ ] 3. Docs: glossary line if useful; delete this folder.
