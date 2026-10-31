import { DieFaceDTO } from './DieFace.dto';

/** A catalog character as the client sees it: identity, stats and the full die with targeting. */
export type CatalogCharacterDTO = {
    id: string;              // catalog id
    name: string;
    maxHp: number;
    baseSpeed: number;
    baseDie: DieFaceDTO[];
};
