# Keep preview

The client shows a timeline of the round during a Keep (UI spec `Goodlock-specs/ui/screens/match.md`, UX-1:
"computed as if every current face were final"). The client has no engine, so the server computes it.

## Protocol

`GameStateDTO.preview?: ResolveStepDTO[]`: present in every state of the KEEP phase, absent otherwise. It is the
log `performResolve` would produce from the current faces, nothing else: the state is not touched, locks are
ignored (they do not change the faces). Every emission of a KEEP state carries it, room-wide or per viewer,
since all faces are public in KEEP (ROLL-2).

## Layer

`previewRound(gs)` in `domain/services/GameLoop.service.ts` (`WRONG_PHASE` outside KEEP); the mapper fills the
field. No new port, ID or effect.

## Client contract

`GameStateView.preview` in `lib/net/models.dart`, parsed like `resolveLog`; schema copied with
`tool/sync_protocol.sh`.
