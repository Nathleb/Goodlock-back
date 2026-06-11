export type DieFaceDTO = {
    description: string;
    priority: number;
    targetConstraint: string;
};

export type CharacterDTO = {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    shield: number;
    baseSpeed: number;
    baseDie: DieFaceDTO[];
    face: DieFaceDTO;
    isFaceLocked: boolean;
    target: { playerIndex: number; slot: number } | null;
    position: { playerIndex: number; slot: number };
};

export type PlayerGameStateDTO = {
    playerIndex: 0 | 1;
    team: CharacterDTO[];
};

export type ResolveChangeDTO = {
    characterId: string;
    after: CharacterDTO;
};

export type ResolveStepDTO = {
    characterId: string;
    skipped: boolean;
    changes: ResolveChangeDTO[];
};

export type GameStateDTO = {
    phase: string;
    currentRound: number;
    rollsLeft: number;
    playersReady: [boolean, boolean];
    players: [PlayerGameStateDTO, PlayerGameStateDTO];
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
