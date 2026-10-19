import { DECK_SIZE, MAX_DECKS_PER_USER, validateDeck } from '@domain/services/Deck.service';
import { CatalogId } from '@shared/branded.types';

const ids = (...xs: string[]) => xs as CatalogId[];
const SIX = ids('a', 'b', 'c', 'd', 'e', 'f');
const everythingKnownAndOwned = { isKnown: () => true, isOwned: () => true };

describe('deck rules', () => {
    it('a deck holds 6 characters and a user has at most 5 decks', () => {
        expect(DECK_SIZE).toBe(6);
        expect(MAX_DECKS_PER_USER).toBe(5);
    });
});

describe('validateDeck', () => {
    it('accepts 6 distinct known, owned characters', () => {
        expect(validateDeck(SIX, everythingKnownAndOwned)).toEqual([]);
    });

    it.each([[5], [7], [0]])('rejects a deck of %i characters', (n) => {
        const deck = ids(...'abcdefgh'.split('').slice(0, n));
        expect(validateDeck(deck, everythingKnownAndOwned)).toEqual([expect.stringMatching(/6/)]);
    });

    it('rejects duplicates, naming them once', () => {
        const errors = validateDeck(ids('a', 'a', 'a', 'b', 'c', 'd'), everythingKnownAndOwned);
        expect(errors).toEqual([expect.stringContaining('"a"')]);
    });

    it('rejects ids the catalog does not know', () => {
        const errors = validateDeck(SIX, { isKnown: id => id !== 'c', isOwned: () => true });
        expect(errors).toEqual([expect.stringContaining('"c"')]);
    });

    it('rejects characters the user does not own', () => {
        const errors = validateDeck(SIX, { isKnown: () => true, isOwned: id => id !== 'f' });
        expect(errors).toEqual([expect.stringContaining('"f"')]);
    });

    it('does not report an unknown id as also unowned', () => {
        const errors = validateDeck(SIX, { isKnown: id => id !== 'c', isOwned: id => id !== 'c' });
        expect(errors).toHaveLength(1);
    });

    it('reports every problem at once', () => {
        const errors = validateDeck(ids('a', 'a', 'x', 'y'), { isKnown: id => id !== 'x', isOwned: id => id !== 'y' });
        expect(errors).toHaveLength(4); // size, duplicate, unknown, unowned
    });
});
