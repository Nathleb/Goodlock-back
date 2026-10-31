# Branded IDs: plan

**Status:** in progress (started 2026-11-01)

Each step is a type-only refactor: no behavior changes, and tests are green before and after.
- The proof for a step is `tsc`: an ID swap, injected in a scratch copy, must fail `tsc`.
- A step covers one ID type across every layer, because narrowing a type forces all its callers to change in the same commit.
- Test fixtures cast their ID literals (`'socket-0' as SocketId`). No assertion changes (approved in the plan).

- [ ] **1 `SocketId`**: ports, managers, `WebSocketService`, coordinators, gateway and session guard.
- [ ] **2 `SessionId`**: `Session.dto`, `Room.type` (`playersId`, `ownerId`), `Room.service`, `RoomPort`, `room.manager`, coordinators.
- [ ] **3 `RoomId`**: `Room.type.roomId`, `Session.dto.roomId`, `RoomPort`, `SessionPort.setSessionRoom`, `WebSocketPort`, managers, coordinators, gateway.
- [ ] **4 `CharacterId`**: `Character.id`, `PriorityQueue.type`, `PriorityQueue.service`, `GameCoordinator`.
- [ ] **5** Delete `PlayerId` and `DeviceId`. Knip baseline down to the measured count.
- [ ] **6 Record**: project `CLAUDE.md` (Branded IDs), move the spec to `implemented/`, memory.
