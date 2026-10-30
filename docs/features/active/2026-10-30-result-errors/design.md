# Result-based error handling — design

**Status:** approved 2026-10-30, in progress

## Purpose

A broken rule ("Room is full") and a server bug (`TypeError`) both reach the player as free text, because the domain throws `new Error('...')`, the WebSocket coordinators do `catch (e) { emitError(e.message) }`, and no error has a type. The client cannot branch on an error, and a bug is shown to the player like a rule violation. This feature introduces `Result<T, E>` (the convention CLAUDE.md names as the target) and gives every player-visible error a stable code.

## Decisions

1. **Decision:** `Result<T, E>` from `neverthrow`, re-exported by `shared/result.type.ts` (the code imports `@shared/result.type`), rather than a hand-written type, because it is an established library whose `andThen`/`map`/`match` fit the chained checks (phase, then ready, then placement), and the re-export keeps one place to swap it.
2. **Decision:** the error value is a plain readonly object `DomainError = { code: DomainErrorCode; message: string }` built by `domainError(code, message)` in `domain/errors/`, rather than an `Error` subclass, because errors-as-values need no stack and the object maps straight onto the `error { code, message }` payload.
3. **Decision:** a function in `domain/` or `application/` that can fail because of a player action returns `Result<T, DomainError>`; a bug, a broken invariant or an authoring/boot error stays a thrown plain `Error`, rather than turning everything into a Result, because those cases have no sensible recovery and must reach the logs. They are: `EffectFactory` "No implementation", the `GameInit` ApplyState/ApplyStat parameter checks, `CharacterGeneration` template validation, the catalog loader, the config readers, and "Unknown character in deck".
4. **Decision:** the gateway's payload validation stays exception-based (a Nest `ValidationPipe` at the edge, answered by `WsErrorFilter`), rather than moving into the domain, because the shape of a message is an adapter concern.
5. **Decision:** the migration is cut by use case into slices that each change domain, application and their tests in one commit, rather than one layer at a time, because changing a return type breaks every caller at once and the compiler is what finds them. This deviates from "a step never spans more than one layer" in CLAUDE.md, and the deviation is limited to these slices.

## What the client receives

One event, `error { code, message }`, for four kinds of error:

| Kind | Code | Where it comes from |
| --- | --- | --- |
| Rule violated by a player action | one of the domain codes below | a `DomainError` in a Result |
| Malformed payload | `INVALID_REQUEST` | the gateway `ValidationPipe` |
| Socket without a session | `NOT_CONNECTED` | `SessionGuard` |
| Anything thrown (bug, invariant) | `INTERNAL`, message "Internal error" | logged on the server, never detailed to the client |

Domain codes: `ROOM_NOT_FOUND`, `ROOM_FULL`, `GAME_ALREADY_STARTED`, `ROOM_NOT_READY`, `NOT_IN_ROOM`, `NOT_ROOM_OWNER`, `DECKS_NOT_CHOSEN`, `WRONG_PHASE`, `ALREADY_CONFIRMED`, `NO_ROLLS_LEFT`, `NO_SELECTION`, `INVALID_SELECTION` (count, duplicate, not in deck), `INVALID_PLACEMENT` (the five placement checks), `INVALID_LOCK` (a die lock that names no character of the player), `ACTION_NOT_AVAILABLE`, `CLAIM_NOT_ALLOWED`. Existing messages are kept word for word. The change to the payload is additive (a new `code` field): a client that only reads `message` keeps working.

## Out of scope

- HTTP coordinators (auth, collection, decks) throw Nest HTTP exceptions from `application/`. They are a separate change (codes plus an HTTP exception filter in infrastructure).
- A lint rule that forbids `throw` in `domain/` and `application/` once the migration is done.
