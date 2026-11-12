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

/** Why a match ended (END-3). */
export type EndReason = 'elimination' | 'clock' | 'reconnection' | 'concede';

/** The time of a player (CLOCK-1): thinking time, reconnection time, and whether they are connected (AWAY-2). */
export type PlayerClock = {
    readonly remainingMs: number;
    readonly reconnectionMs: number;
    readonly connected: boolean;
    /**
     * The thinking time the opponent is shown: it is updated at the end of each decision phase, never
     * during one (GAME-7), so the opponent cannot tell when a player confirmed.
     */
    readonly publishedMs: number;
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
    /** The winner, once a player has lost (END-1); 'draw' when both lose on time at the same instant. Absent while the match goes on. */
    readonly winner?: PlayerIndex | 'draw';
    /** Why the match ended; set with `winner`. */
    readonly endReason?: EndReason;
    /** Indexed by player. Settled by `settleClocks` up to `clockUpdatedAt`. */
    readonly clocks: readonly [PlayerClock, PlayerClock];
    /** Epoch ms of the last settling of the clocks. */
    readonly clockUpdatedAt: number;
    /** Present only during SELECTION. */
    readonly selection?: SelectionState;
};

export default GameState;
