import { DieFaceDTO } from './GameState.dto';

export type CollectionCharacterDTO = {
    id: string;              // catalog id
    name: string;
    maxHp: number;
    baseSpeed: number;
    baseDie: DieFaceDTO[];
    acquiredAt: string;      // ISO
};

export type CollectionDTO = { characters: CollectionCharacterDTO[] };
