# Protocol schema: a machine-readable contract with the client — design

**Status:** implemented 2026-11-03. Client side: `../Goodlock-app/docs/features/implemented/2026-10-26-protocol-schema/plan.md`.

## Why

The client mirrors the server's protocol by hand (`Goodlock-app/lib/net/models.dart`). Nothing enforces that the two match; recorded fixtures are the only safety net and they drift silently. The server should publish its protocol as a JSON Schema that the client tests validate against.

## Rules

- `ServerEvents` (`application/dtos/Protocol.dto.ts`) maps every server-to-client event name to its payload type. It is the single list of what the server sends.
- `WebSocketPort.emitToRoom` and `emitToSocket` are typed against `ServerEvents`: an emit with the wrong event name or payload does not compile.
- `protocol/protocol.schema.json` is generated from `ServerEvents` (`npm run protocol:schema`) and committed. A spec regenerates it in memory and fails when the committed file is stale.
- The schema is strict (`additionalProperties: false`), so a new field the client does not know about fails its fixtures until the schema is synced.
- Inbound payloads (`payloads/*.payload.ts`) are out of scope: `class-validator` already checks them on the server.

## Decisions

- Decision: type `WebSocketPort` emits against `ServerEvents` rather than keep a separate list of events, because only a compiled map stays in sync with the code.
- Decision: generate the schema with `ts-json-schema-generator` rather than `class-validator-jsonschema`, because the outbound DTOs are plain TS types, not decorated classes.
- Decision: the schema is generated with `strictNullChecks` on (`tsconfig.protocol.json`) so `| null` survives, while the app and the typing tests compile with it off, rather than turning it on app-wide, because that is a separate refactor. Limit: an emit of `null` or `undefined` where the schema requires a value still compiles, and JSON drops an `undefined` field. Only the client's fixture validation catches it. No emitter does this today.
- Decision: commit the generated schema, and let the client keep a synced copy, rather than have client tests read `../Goodlock-back`, because the client repo must stay testable on its own.

## Client contract

No event or payload changes. The client gains `test/protocol/protocol.schema.json` (synced with `tool/sync_protocol.sh`) and tests validating its fixtures against it.

## Out of scope

Dart code generation from the schema. Inbound payloads. HTTP endpoints (OpenAPI).
