import { TEST_CATALOG_ID } from './helpers/catalog';
import { SlotIndex, PlayerIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "./helpers/gameState";
import { createPlayer, placeTeam } from "@domain/services/Player.service";
import { Player } from "@domain/types/Player.type";
import { unwrap, unwrapErr } from './helpers/result';
import {
    checkPhase,
    checkNotReady,
    beginPlacementPhase, beginRollPhase, beginKeepPhase,
    beginResolvePhase, beginResultPhase,
} from "@domain/services/Phase.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel } from "./helpers/targets";
import GamePhase from "@domain/types/GamePhase.type";


const die = generateFullDie([
    { description: "A", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "B", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "C", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "E", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "F", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
] satisfies BaseDieInstructions);

const team1 = [0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `P1-${i}`, maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: 0, slot: i as SlotIndex } }));
const team2 = [0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `P2-${i}`, maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: 1, slot: i as SlotIndex } }));
const gs = createGameState(createPlayer(team1, 0), createPlayer(team2, 1));

describe('Phase transitions', () => {
    it('initial phase is PLACEMENT_PHASE', () => {
        expect(gs.phase).toBe(GamePhase.PLACEMENT);
    });

    it('each beginX function sets the correct phase', () => {
        expect(beginPlacementPhase(gs).phase).toBe(GamePhase.PLACEMENT);
        expect(beginRollPhase(gs).phase).toBe(GamePhase.ROLL);
        expect(beginKeepPhase(gs).phase).toBe(GamePhase.KEEP);
        expect(beginResolvePhase(gs).phase).toBe(GamePhase.RESOLVE);
        expect(beginResultPhase(gs).phase).toBe(GamePhase.RESULT);
    });

    it('phase transitions are immutable', () => {
        const updated = beginRollPhase(gs);
        expect(gs.phase).toBe(GamePhase.PLACEMENT);
        expect(updated.phase).toBe(GamePhase.ROLL);
    });
});

describe('placeTeam', () => {
    // A team of 4 after team preview: slots 0..3, slot 4 empty.
    const player = createPlayer(team1.slice(0, 4), 0);
    const [a, b, c, d] = player.team.map(ch => ch.id);
    const layout = (p: Player) => [0, 1, 2, 3, 4].map(slot => p.team.find(ch => ch.position.slot === slot)?.id ?? null);

    it('puts each character on its cell and leaves the null cell empty', () => {
        const placed = unwrap(placeTeam(player, [null, d, c, b, a]));
        expect(layout(placed)).toEqual([null, d, c, b, a]);
    });

    it('keeps the team ordered by slot', () => {
        const placed = unwrap(placeTeam(player, [d, null, a, c, b]));
        expect(placed.team.map(ch => ch.id)).toEqual([d, a, c, b]);
        expect(placed.team.map(ch => ch.position.slot)).toEqual([0, 2, 3, 4]);
    });

    it('does not mutate the original player', () => {
        placeTeam(player, [null, d, c, b, a]);
        expect(layout(player)).toEqual([a, b, c, d, null]);
    });

    it.each([
        ['not an array', 'abc'],
        ['4 cells', [a, b, c, d]],
        ['6 cells', [a, b, c, d, null, null]],
        ['no empty cell', [a, b, c, d, a]],
        ['two empty cells', [a, b, c, null, null]],
        ['a duplicate', [a, a, c, d, null]],
        ['an unknown id', [a, b, c, 'ghost', null]],
        ['a non-string id', [a, b, c, 4, null]],
    ])('rejects %s', (_label, slots) => {
        const error = unwrapErr(placeTeam(player, slots as unknown as (string | null)[]));
        expect(error.code).toBe('INVALID_PLACEMENT');
    });
});

describe('placeTeam messages', () => {
    const player = createPlayer(team1.slice(0, 4), 0);
    const [a, b, c, d] = player.team.map(ch => ch.id);

    it.each([
        ['4 cells', [a, b, c, d], 'Placement must list exactly 5 cells'],
        ['a non-string id', [a, b, c, 4, null], 'Placement cells must be character IDs or null'],
        ['two empty cells', [a, b, c, null, null], 'Placement must leave exactly 1 empty cell(s)'],
        ['a duplicate', [a, a, c, d, null], 'Duplicate character IDs in placement'],
        ['an unknown id', [a, b, c, 'ghost', null], 'Unknown character ID in placement'],
    ])('explains %s', (_label, slots, message) => {
        expect(unwrapErr(placeTeam(player, slots as unknown as (string | null)[])).message).toBe(message);
    });
});

describe('checkPhase', () => {
    it('returns the state when the phase matches', () => {
        expect(unwrap(checkPhase(gs, GamePhase.PLACEMENT))).toBe(gs);
    });

    it('returns a WRONG_PHASE error naming both phases when it does not', () => {
        expect(unwrapErr(checkPhase(gs, GamePhase.ROLL))).toEqual({
            code: 'WRONG_PHASE',
            message: `Expected phase ${GamePhase.ROLL}, got ${GamePhase.PLACEMENT}`,
        });
    });
});

describe('checkNotReady', () => {
    it('returns the state when the player has not confirmed', () => {
        expect(unwrap(checkNotReady(gs, 0 as PlayerIndex))).toBe(gs);
    });

    it('returns an ALREADY_CONFIRMED error for a player who confirmed, and not for the other one', () => {
        const ready = { ...gs, playersReady: [true, false] as [boolean, boolean] };
        expect(unwrapErr(checkNotReady(ready, 0 as PlayerIndex))).toEqual({
            code: 'ALREADY_CONFIRMED',
            message: 'Player has already confirmed',
        });
        expect(unwrap(checkNotReady(ready, 1 as PlayerIndex))).toBe(ready);
    });
});
