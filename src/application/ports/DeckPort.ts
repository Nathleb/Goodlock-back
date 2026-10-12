import { CatalogId, DeckId, UserId } from '@shared/branded.types';

export type DeckRecord = {
    readonly id: DeckId;
    readonly userId: UserId;
    readonly name: string;
    readonly characterIds: readonly CatalogId[];   // slot order
    readonly createdAt: Date;
    readonly updatedAt: Date;
};

export type DeckContent = { readonly name: string; readonly characterIds: readonly CatalogId[] };

/** Raw deck storage. Ownership and composition rules are enforced by the caller. */
export interface DeckPort {
    listByUser(userId: UserId): Promise<readonly DeckRecord[]>;
    findById(id: DeckId): Promise<DeckRecord | undefined>;
    countByUser(userId: UserId): Promise<number>;
    create(userId: UserId, content: DeckContent): Promise<DeckRecord>;
    /** Replaces the name and every slot atomically. */
    update(id: DeckId, content: DeckContent): Promise<DeckRecord>;
    delete(id: DeckId): Promise<void>;
}
