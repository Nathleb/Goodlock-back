import { CatalogCharacterDTO } from './Catalog.dto';
import { PlayerIndex } from '@domain/types/Position.type';

export type TargetGroupDTO = { side: string; mode: string; n: number[] };

export type FaceEffectDTO = { effect: string; magnitude: number; targets: TargetGroupDTO[]; stat?: string; duration?: number };

export type StatInstanceDTO = { stat: string; value: number; roundsLeft: number };

export type DieFaceDTO = {
    description: string;
    priority: number;
    effects: FaceEffectDTO[];
};

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
    isFaceLocked: boolean;
    position: { playerIndex: number; slot: number };
    /** Active stat instances (buffs and debuffs). */
    modifiers: StatInstanceDTO[];
    /** Net value per stat, capped; computed by the server so clients do not duplicate the cap. */
    stats: Record<string, number>;
};

export type PlayerGameStateDTO = {
    playerIndex: 0 | 1;
    team: CharacterDTO[];
};

export type ResolveChangeDTO = {
    characterId: string;
    after: CharacterDTO;
};

export type ResolvedEffectDTO = {
    effect: string;
    targets: { playerIndex: number; slot: number }[];  // [] = fizzled
};

export type ResolveStepDTO = {
    characterId: string;
    skipped: boolean;
    effects: ResolvedEffectDTO[];
    changes: ResolveChangeDTO[];
};

export type GameStateDTO = {
    phase: string;
    currentRound: number;
    /** Player index that wins exact ties in the resolution order this round. Public in every phase. */
    initiativePlayerIndex: PlayerIndex;
    rollsLeft: number;
    playersReady: [boolean, boolean];
    players: [PlayerGameStateDTO, PlayerGameStateDTO];
    /** SELECTION only, per viewer: both revealed decks and the viewer's own pick (never the opponent's). */
    selection?: SelectionViewDTO;
};

export type SelectionViewDTO = {
    decks: [CatalogCharacterDTO[], CatalogCharacterDTO[]];
    myPicks: string[] | null;
};

export type GameStateUpdatePayload = GameStateDTO & {
    /** Remaining ms until an AFK claim becomes valid against the non-ready player; null when not applicable. Computed server-side at emit time. */
    afkClaimInMs: number | null;
};

export type PresenceChangedDTO = {
    playerIndex: 0 | 1;
    connected: boolean;
    /** Remaining ms until a forfeit claim becomes valid; null when connected. */
    claimInMs: number | null;
};

export type GameOverDTO = {
    winner: 0 | 1 | 'draw';
    reason: 'elimination' | 'forfeit' | 'afk' | 'concede';
};
