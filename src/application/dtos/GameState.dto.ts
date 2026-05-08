export type DieFaceDTO = {
    description: string;
    priority: number;
};

export type CharacterDTO = {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    shield: number;
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
