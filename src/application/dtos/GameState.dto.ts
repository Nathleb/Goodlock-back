import { CatalogCharacterDTO } from './Catalog.dto';
import { DieFaceDTO } from './DieFace.dto';
import { PlayerIndex } from '@domain/types/Position.type';
import { EndReason } from '@domain/types/GameState.type';

type StatInstanceDTO = { stat: string; value: number; roundsLeft: number };

export type CharacterDTO = {
    id: string;
    catalogId: string;   // which catalog character this is (art, name lookup)
    name: string;
    hp: number;
    maxHp: number;
    shield: number;
    baseSpeed: number;
    baseDie: DieFaceDTO[];
    face: DieFaceDTO;
    /**
     * Whether the die was kept at the last Roll (ROLL-2). In the state sent to one player only,
     * their own dice show instead what they last confirmed in the current Keep (GAME-9).
     */
    isFaceLocked: boolean;
    position: { playerIndex: number; slot: number };
    /** Active stat instances (buffs and debuffs). */
    modifiers: StatInstanceDTO[];
    /** Net value per stat, capped; computed by the server so clients do not duplicate the cap. */
    stats: Record<string, number>;
    /** Signed duration counter per state axis (SPEED: + hasted / - slowed, ...), 0 when none. */
    states: Record<string, number>;
};

export type PlayerGameStateDTO = {
    playerIndex: 0 | 1;
    /** The characters on the board. */
    team: CharacterDTO[];
    /** The characters who died and left the board, in order of death, with 0 HP. */
    fallen: CharacterDTO[];
};

type ResolveChangeDTO = {
    characterId: string;
    after: CharacterDTO;
};

type ResolvedEffectDTO = {
    effect: string;
    targets: { playerIndex: number; slot: number }[];  // [] = fizzled
};

export type ResolveStepDTO = {
    characterId: string;
    skipped: boolean;
    effects: ResolvedEffectDTO[];
    changes: ResolveChangeDTO[];
};

/**
 * The time of a player. A client counts down only its own clock, from the moment it receives the state,
 * while `running` is true. The opponent's `remainingMs` is the value published at the end of the last
 * decision phase: it changes only when the next phase ends, never during one (GAME-7, GAME-9).
 */
export type PlayerClockDTO = {
    remainingMs: number;
    reconnectionMs: number;
    running: boolean;
    connected: boolean;
};

export type GameStateDTO = {
    phase: string;
    currentRound: number;
    /** Player index that wins exact ties in the resolution order this round. Public in every phase. */
    initiativePlayerIndex: PlayerIndex;
    rollsLeft: number;
    /** Public in every phase (GAME-7). `running` never tells whether the opponent has confirmed (GAME-9). */
    clocks: [PlayerClockDTO, PlayerClockDTO];
    /**
     * Per viewer only: whether the viewer has confirmed in the current phase. Never the opponent's
     * (GAME-9), and absent from what is sent to both players.
     */
    myReady?: boolean;
    players: [PlayerGameStateDTO, PlayerGameStateDTO];
    /** SELECTION only, per viewer: both revealed decks and the viewer's own pick (never the opponent's). */
    selection?: SelectionViewDTO;
};

type SelectionViewDTO = {
    decks: [CatalogCharacterDTO[], CatalogCharacterDTO[]];
    myPicks: string[] | null;
};

export type PresenceChangedDTO = {
    playerIndex: 0 | 1;
    connected: boolean;
    /** Reconnection time the player has left (AWAY-2). */
    reconnectionMs: number;
};

export type GameOverDTO = {
    winner: 0 | 1;
    reason: EndReason;
};
