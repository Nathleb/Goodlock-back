import { CatalogId, UserId } from '@shared/branded.types';

export type OwnedCharacterRow = { readonly characterId: CatalogId; readonly acquiredAt: Date };

/** Characters a user owns. Rows hold catalog ids only; definitions live in the CatalogPort. */
export interface CollectionPort {
    listOwned(userId: UserId): Promise<readonly OwnedCharacterRow[]>;
    /** Idempotent: ids the user already owns are ignored. */
    grantMany(userId: UserId, ids: readonly CatalogId[]): Promise<void>;
    /** Distinct owned ids, across all users, that are not in `known`. */
    listUnknownIds(known: readonly CatalogId[]): Promise<readonly string[]>;
}
