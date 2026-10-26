# Protocol schema — plan

**Status:** in progress (started 2026-10-26). Spec: `design.md`.

Each step is one layer, one failing test first, one commit.

- [x] 1. Application: `ServerEvents` and the named payload types (`RoundResolvedDTO`, `ErrorPayload`, `SessionStartedDTO`, `SessionEvictedDTO`) in `application/dtos/Protocol.dto.ts`. Test first: `tests/Protocol.dto.spec.ts` (type assertions with `@ts-expect-error`; red is `npx tsc --noEmit`).
- [ ] 2. Application: type `WebSocketPort` emits against `ServerEvents`; coordinators use the named types. Test first: a `@ts-expect-error` emit in a coordinator spec.
- [ ] 3. Infrastructure: `WebSocketService` and `Session.guard.ts` match the typed port. Test: existing specs plus tsc.
- [ ] 4. Tooling: `ts-json-schema-generator`, `scripts/protocol-schema.ts`, `npm run protocol:schema`, committed `protocol/protocol.schema.json`. Test first: `tests/protocol/ProtocolSchema.spec.ts` (committed file equals regenerated schema).
- [ ] 5. Docs: back `CLAUDE.md` ("Add a WebSocket event", "Client contract").
