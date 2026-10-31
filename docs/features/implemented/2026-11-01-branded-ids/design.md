# Branded IDs: design

**Status:** implemented 2026-11-01

## Why

The services take their identifiers as raw `string`s. Nothing stops a call from passing a `roomId` where a `sessionId` is expected: the parameters `(playerId: string, roomId: string)` of `joinRoom` can be swapped, and the compiler will not notice. `shared/branded.types.ts` already declares one type per kind of ID. Only `UserId`, `CatalogId` and `DeckId` are in use. The other types are unused, and knip reports them.

## What changes

| Type | Carried by |
|---|---|
| `SocketId` | `Session.socketId`, `SessionPort`, `WebSocketPort`, the coordinators' public methods, the managers and their map keys, `WebSocketService` |
| `SessionId` | `Session.sessionId`, `Room.playersId`, `Room.ownerId`, `Room.service`, `RoomPort` |
| `RoomId` | `Room.roomId`, `Session.roomId`, `RoomPort`, `SessionPort.setSessionRoom`, `WebSocketPort`, `RoomManager`'s maps |
| `DeckId` (already branded) | `RoomCoordinator.selectDeck`, branded in the gateway |
| `CharacterId` | `Character.id`, `PriorityQueue.type` (`QueueEntry`, `characterId`, `changes`), `PriorityQueue.service`, `Effect.solve` (`actorId`, `affected`) and the strategies, `applyAtPositions` |

## Decisions

- **Decision:** the brand is applied at the edges, with an `as` cast, rather than through mint functions, because the codebase already brands that way (`randomUUID() as UserId`) and a mint function would only wrap the same cast. The edges are:
  - the gateway, for `client.id` and for the IDs a payload brings (`roomId`, `deckId`); the HTTP controllers and the repositories already cast the same way for `UserId`, `DeckId` and `CatalogId`;
  - the generators: `Room.service` (`roomId`), `session.manager` (`sessionId`) and `CharacterGeneration.service` (`Character.id`);
- **Decision:** character IDs sent by the client (`confirmKeep`, `rearrangeTeam`) stay `string`, rather than being cast, because they are untrusted until matched against the real team; after the match the code uses the team's own `CharacterId`s.
- **Decision:** `Room.deckSelections` stays keyed by `string`, rather than `Record<SessionId, ...>`, because a branded key makes every object literal in tests and code fail to type while the lookups already go through a `SessionId`.
- **Decision:** wire DTOs stay `string` (`Room.dto`, `Player.dto`, `GameState.dto`), rather than branded types. A branded value still serializes as a plain string. Keeping `string` leaves `protocol/protocol.schema.json` and the Goodlock-app client untouched. `Session.dto` is internal and never sent, so it is branded.
- **Decision:** `PlayerId` and `DeviceId` are deleted, rather than adopted.
  - A room's players are sessions: `playersId` and `ownerId` hold `sessionId` values. Keeping `PlayerId` would give a second name to the same thing.
  - Device identifiers disappeared when sessions were bound to `userId`.
- **Decision:** an ID-type change is proven with `tsc`, rather than with `@ts-expect-error` tests. `@ts-expect-error` is one of the project's declared suppressions. The proof: a swap of two IDs, injected in a scratch copy, must fail `tsc`.

## Tests

Fixtures cast their literals through `tests/helpers/ids.ts` (`P0`, `P1`, `P2`, `asSession`, `asRoom`, `asCharacter`) or a local `as SocketId` constant. Asserted values are unchanged.

## Out of scope

- Domain functions that take a `PlayerIndex` (`0 | 1`) rather than an ID: they keep it.
- The HTTP side (`UserId`, `DeckId`, `CatalogId`): already branded.
