import GameState from "./GameState.type";
import { CatalogId, SessionId, RoomId } from "@shared/branded.types";

export type Room = {
    readonly roomId: RoomId;
    readonly playersId: readonly SessionId[];
    readonly ownerId: SessionId;
    readonly isStarted: boolean;
    readonly gameState?: GameState;
    /** Snapshotted at startRoom; immutable afterwards. Index = playerIndex in gameState.players. */
    readonly playerOrder?: readonly [SessionId, SessionId];
    /** Lobby only: snapshot of each player's chosen deck (session id -> catalog ids), taken at selectDeck. */
    readonly deckSelections?: Readonly<Record<string, readonly CatalogId[]>>;
};
