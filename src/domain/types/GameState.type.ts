import GamePhase from "./GamePhase.type";
import PriorityQueue from "./PriorityQueue.type";
import { Player } from "./Player.type";
import CharacterTemplate from "./CharacterTemplate.type";
import { PlayerIndex } from "./Position.type";
import { CatalogId } from "@shared/branded.types";

/** Team preview: both decks are revealed, each player secretly keeps TEAM_SIZE of their own. */
export type SelectionState = {
    readonly decks: readonly [readonly CharacterTemplate[], readonly CharacterTemplate[]];
    readonly picks: readonly [readonly CatalogId[] | null, readonly CatalogId[] | null];
};

type GameState = {
    readonly phase: GamePhase;
    readonly currentRound: number;
    /** Wins exact ties in the resolution order. Drawn once at init, flipped at the end of each round. */
    readonly initiativePlayerIndex: PlayerIndex;
    readonly rollsLeft: number;
    readonly playersReady: readonly [boolean, boolean];
    readonly priorityQueue: PriorityQueue;
    readonly players: readonly [Player, Player];
    /** Present only during SELECTION. */
    readonly selection?: SelectionState;
};

export default GameState;
