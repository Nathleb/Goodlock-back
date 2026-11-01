# Protocol schema — plan

**Status:** in progress (started 2026-10-26). Spec: `design.md`.

Each step is one layer, one failing test first, one commit.

- [x] 1. Application: `ServerEvents` and the named payload types (`RoundResolvedDTO`, `ErrorPayload`, `SessionStartedDTO`, `SessionEvictedDTO`) in `application/dtos/Protocol.dto.ts`. Test first: `tests/Protocol.dto.spec.ts` (refused payloads are compiled through `tests/helpers/typeErrors.ts`, see step 6).
- [x] 2. Application: type `WebSocketPort` emits against `ServerEvents`; coordinators use the named types. Test first: a refused emit in `tests/WebSocketPort.spec.ts`.
- [x] 3. Infrastructure: `WebSocketService` and `Session.guard.ts` match the typed port. Test: existing specs plus tsc.
- [x] 4. Tooling: `ts-json-schema-generator`, `scripts/protocol-schema.ts`, `npm run protocol:schema`, committed `protocol/protocol.schema.json`. Test first: `tests/ProtocolSchema.spec.ts` (committed file equals regenerated schema).
- [x] 5. Docs: back `CLAUDE.md` ("Add a WebSocket event", "Client contract").
- [x] 6. Rebase on main (Result errors, branded IDs). `@ts-expect-error` is a declared suppression of the quality gates: the typing tests compile snippets with the TypeScript API (`tests/helpers/typeErrors.ts`) and assert the compiler message, with a valid snippet as a control (option chosen by the user on 2026-11-01).
- [x] 7. Application (J7 of the Result errors work): `ServerEvents.error` uses `ErrorPayload { code, message }` from `Error.dto.ts`; the old `{ message }` type is gone. Test first: `ProtocolSchema.spec` requires `code` with the domain codes.
