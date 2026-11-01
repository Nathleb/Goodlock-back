import GamePhase from '@domain/types/GamePhase.type';
import GameState from '@domain/types/GameState.type';
import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { cancelSelection, confirmSelection, createSelectionState } from '@domain/services/GameLoop.service';
import { unwrap, unwrapErr } from './helpers/result';
import { createCharacterFromTemplate } from '@domain/services/CharacterGeneration.service';
import { TEAM_SIZE } from '@domain/services/Deck.service';
import { CatalogId } from '@shared/branded.types';
import { testTemplate } from './helpers/catalog';

const build = (t: CharacterTemplate) => createCharacterFromTemplate(t);
const ids = (...xs: string[]) => xs as CatalogId[];

const deck = (prefix: string) => Array.from({ length: 6 }, (_, i) => testTemplate(`${prefix}${i}`));
const DECK_0 = deck('a');
const DECK_1 = deck('b');
const PICK_0 = ids('a5', 'a0', 'a1', 'a2');
const PICK_1 = ids('b0', 'b1', 'b2', 'b3');

let gs: GameState;
beforeEach(() => { gs = createSelectionState([DECK_0, DECK_1]); });

describe('createSelectionState', () => {
    it('starts in SELECTION with both decks revealed, no picks and empty teams', () => {
        expect(TEAM_SIZE).toBe(4);
        expect(gs.phase).toBe(GamePhase.SELECTION);
        expect(gs.selection?.decks[0].map(t => t.id)).toEqual(DECK_0.map(t => t.id));
        expect(gs.selection?.picks).toEqual([null, null]);
        expect(gs.players.map(p => p.team)).toEqual([[], []]);
        expect(gs.playersReady).toEqual([false, false]);
        expect(gs.currentRound).toBe(0);
        expect(gs.rollsLeft).toBe(2);
    });
});

describe('confirmSelection', () => {
    it('first confirm stores the pick and marks the player ready, nothing else', () => {
        const next = unwrap(confirmSelection(gs, 0, PICK_0, build));
        expect(next.phase).toBe(GamePhase.SELECTION);
        expect(next.playersReady).toEqual([true, false]);
        expect(next.selection?.picks).toEqual([PICK_0, null]);
        expect(next.players[0].team).toEqual([]);
    });

    it('second confirm builds both teams in pick order and moves to PLACEMENT', () => {
        const next = unwrap(confirmSelection(unwrap(confirmSelection(gs, 0, PICK_0, build)), 1, PICK_1, build));
        expect(next.phase).toBe(GamePhase.PLACEMENT);
        expect(next.selection).toBeUndefined();
        expect(next.playersReady).toEqual([false, false]);
        expect(next.players[0].team.map(c => c.catalogId)).toEqual(PICK_0);
        expect(next.players[1].team.map(c => c.catalogId)).toEqual(PICK_1);
        expect(next.players[0].team.map(c => c.position)).toEqual([0, 1, 2, 3].map(slot => ({ playerIndex: 0, slot })));
        expect(next.players[1].team[0].position.playerIndex).toBe(1);
    });

    it('rejects outside SELECTION', () => {
        expect(unwrapErr(confirmSelection({ ...gs, phase: GamePhase.PLACEMENT }, 0, PICK_0, build)).code).toBe('WRONG_PHASE');
    });

    it('rejects a second confirm from the same player', () => {
        const once = unwrap(confirmSelection(gs, 0, PICK_0, build));
        expect(unwrapErr(confirmSelection(once, 0, PICK_0, build))).toEqual({ code: 'ALREADY_CONFIRMED', message: 'Player has already confirmed' });
    });

    it.each([
        ['3 characters', ids('a0', 'a1', 'a2')],
        ['5 characters', ids('a0', 'a1', 'a2', 'a3', 'a4')],
        ['a duplicate', ids('a0', 'a0', 'a1', 'a2')],
        ["a character from the opponent's deck", ids('b0', 'a1', 'a2', 'a3')],
        ['an unknown character', ids('zz', 'a1', 'a2', 'a3')],
    ])('rejects a pick with %s, leaving state untouched', (_label, pick) => {
        expect(unwrapErr(confirmSelection(gs, 0, pick, build)).code).toBe('INVALID_SELECTION');
        expect(gs.selection?.picks).toEqual([null, null]);
    });
});

describe('confirmSelection without a selection in progress', () => {
    it('returns a NO_SELECTION error', () => {
        const { selection: _removed, ...withoutSelection } = gs;
        expect(unwrapErr(confirmSelection(withoutSelection, 0, PICK_0, build)).code).toBe('NO_SELECTION');
    });
});

describe('cancelSelection', () => {
    it('un-readies the player and clears their pick', () => {
        const next = unwrap(cancelSelection(unwrap(confirmSelection(gs, 0, PICK_0, build)), 0));
        expect(next.playersReady).toEqual([false, false]);
        expect(next.selection?.picks).toEqual([null, null]);
    });

    it('is a no-op when the player had not confirmed', () => {
        expect(unwrap(cancelSelection(gs, 1))).toBe(gs);
    });

    it('rejects outside SELECTION', () => {
        expect(unwrapErr(cancelSelection({ ...gs, phase: GamePhase.PLACEMENT }, 0)).code).toBe('WRONG_PHASE');
    });
});

describe('selection error messages', () => {
    it('explains a pick of the wrong size', () => {
        expect(unwrapErr(confirmSelection(gs, 0, ids('a0', 'a1', 'a2'), build)).message).toBe('Pick exactly 4 characters (got 3)');
    });

    it('lists every picked character that is not in the deck', () => {
        expect(unwrapErr(confirmSelection(gs, 0, ids('a0', 'a1', 'b0', 'b1'), build)).message).toBe('Not in your deck: b0, b1');
    });

    it('explains a confirm when no selection is in progress', () => {
        const noSelection = { ...gs, selection: undefined };
        expect(unwrapErr(confirmSelection(noSelection, 0, PICK_0, build))).toEqual({ code: 'NO_SELECTION', message: 'No selection in progress' });
    });
});
