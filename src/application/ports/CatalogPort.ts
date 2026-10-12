import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { CatalogId } from '@shared/branded.types';

/** Character definitions available in this version of the game. Loaded once, read synchronously. */
export interface CatalogPort {
    list(): readonly CharacterTemplate[];
    get(id: CatalogId): CharacterTemplate | undefined;
    has(id: CatalogId): boolean;
    ids(): readonly CatalogId[];
}
