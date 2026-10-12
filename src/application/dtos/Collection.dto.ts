import { CatalogCharacterDTO } from './Catalog.dto';

export type CollectionCharacterDTO = CatalogCharacterDTO & {
    acquiredAt: string;      // ISO
};

export type CollectionDTO = { characters: CollectionCharacterDTO[] };
