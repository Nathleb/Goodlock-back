import { CatalogId } from "@shared/branded.types";

/** A deck is the pool a player brings; before each match they keep TEAM_SIZE of these (slice C). */
export const DECK_SIZE = 6;
export const MAX_DECKS_PER_USER = 5;
/** Characters each player keeps from their deck for a match. */
export const TEAM_SIZE = 4;

export type DeckLookups = {
    readonly isKnown: (id: CatalogId) => boolean;
    readonly isOwned: (id: CatalogId) => boolean;
};

/** Composition rules for a deck. Returns every problem found; [] means the deck is valid. */
export function validateDeck(characterIds: readonly CatalogId[], { isKnown, isOwned }: DeckLookups): string[] {
    const errors: string[] = [];

    if (characterIds.length !== DECK_SIZE) {
        errors.push(`A deck must contain exactly ${DECK_SIZE} characters (got ${characterIds.length})`);
    }

    const distinct = [...new Set(characterIds)];
    for (const id of distinct) {
        if (characterIds.filter(x => x === id).length > 1) errors.push(`Character "${id}" appears more than once`);
    }
    for (const id of distinct) {
        if (!isKnown(id)) errors.push(`Unknown character "${id}"`);
        else if (!isOwned(id)) errors.push(`Character "${id}" is not in your collection`);
    }
    return errors;
}
