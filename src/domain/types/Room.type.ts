import GameState from "./GameState.type";
import { PlayerPresence } from "./Presence.type";
import { CatalogId } from "@shared/branded.types";

export type Room = {
    readonly roomId: string;
    readonly playersId: readonly string[];
    readonly ownerId: string;
    readonly isStarted: boolean;
    readonly gameState?: GameState;
    /** Snapshotted at startRoom; immutable afterwards. Index = playerIndex in gameState.players. */
    readonly playerOrder?: readonly [string, string];
    /** Indexed like playerOrder. Only present on started rooms. */
    readonly presence?: readonly [PlayerPresence, PlayerPresence];
    /** Stamped by RoomManager when phase or rollsLeft changes. Epoch ms. */
    readonly phaseStartedAt?: number;
    /** Lobby only: snapshot of each player's chosen deck (session id -> catalog ids), taken at selectDeck. */
    readonly deckSelections?: Readonly<Record<string, readonly CatalogId[]>>;
};
