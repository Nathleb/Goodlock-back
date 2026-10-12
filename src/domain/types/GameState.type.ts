import GamePhase from "./GamePhase.type";
import PriorityQueue from "./PriorityQueue.type";
import { Player } from "./Player.type";
import CharacterTemplate from "./CharacterTemplate.type";
import { CatalogId } from "@shared/branded.types";

/** Team preview: both decks are revealed, each player secretly keeps TEAM_SIZE of their own. */
export type SelectionState = {
    readonly decks: readonly [readonly CharacterTemplate[], readonly CharacterTemplate[]];
    readonly picks: readonly [readonly CatalogId[] | null, readonly CatalogId[] | null];
};

type GameState = {
    readonly phase: GamePhase;
    readonly currentRound: number;
    readonly rollsLeft: number;
    readonly playersReady: readonly [boolean, boolean];
    readonly priorityQueue: PriorityQueue;
    readonly players: readonly [Player, Player];
    /** Present only during SELECTION. */
    readonly selection?: SelectionState;
};

export default GameState;
