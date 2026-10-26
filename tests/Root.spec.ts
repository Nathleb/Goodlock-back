import { TEST_CATALOG_ID } from './helpers/catalog';
import Damage from "@domain/strategies/Damage.class";
import Swap from "@domain/strategies/Swap.class";
import EffectLabel from "@domain/types/EffectLabels.type";
import { addAllEffectsToPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import Position, { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { Player } from "@domain/types/Player.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const four = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);
const five = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });
const occupant = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team.find(c => c.position.slot === slot);
const root = (s: GameState, pi: PlayerIndex, slot: number, value = 1): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map(c => c.position.slot === slot ? { ...c, states: { ROOT: { value, touchedRound: 0 } } } : c) };
    return { ...s, players };
};

describe('ROOT', () => {
    it('makes a Swap fizzle when one of the two occupants is rooted', () => {
        const gs = root(createGameState(five(0, 'A'), five(1, 'B')), 0, 1);
        const rootedId = occupant(gs, 0, 1)!.id;

        const { state, affected } = new Swap().solve(gs, [pos(0, 1), pos(0, 2)], rootedId);

        expect(affected).toEqual([]);
        expect(state).toBe(gs);
    });

    it('makes a Swap fizzle when the rooted character would move into an empty cell', () => {
        const gs = root(createGameState(four(0, 'A'), four(1, 'B')), 0, 3);
        const rootedId = occupant(gs, 0, 3)!.id;

        const { state, affected } = new Swap().solve(gs, [pos(0, 3), pos(0, 4)], rootedId);

        expect(affected).toEqual([]);
        expect(occupant(state, 0, 3)!.id).toBe(rootedId);
        expect(occupant(state, 0, 4)).toBeUndefined();
    });

    it('makes a Swap fizzle when an unrooted character would move into the cell of a rooted one', () => {
        const gs = root(createGameState(five(0, 'A'), five(1, 'B')), 0, 2);

        const { affected } = new Swap().solve(gs, [pos(0, 1), pos(0, 2)], occupant(gs, 0, 1)!.id);

        expect(affected).toEqual([]);
    });

    it('does not touch a Swap that does not involve the rooted character', () => {
        const gs = root(createGameState(five(0, 'A'), five(1, 'B')), 0, 3);
        const [a, b] = [occupant(gs, 0, 1)!.id, occupant(gs, 0, 2)!.id];

        const { state, affected } = new Swap().solve(gs, [pos(0, 1), pos(0, 2)], a);

        expect(affected.sort()).toEqual([a, b].sort());
        expect(occupant(state, 0, 1)!.id).toBe(b);
        expect(occupant(state, 0, 2)!.id).toBe(a);
    });

    it('still lets an unrooted character move into an empty cell while another character is rooted', () => {
        const gs = root(createGameState(four(0, 'A'), four(1, 'B')), 0, 0);
        const mover = occupant(gs, 0, 3)!.id;

        const { state } = new Swap().solve(gs, [pos(0, 3), pos(0, 4)], mover);

        expect(occupant(state, 0, 4)!.id).toBe(mover);
    });

    it('a rooted character still acts and still takes damage', () => {
        const rooted = (c: ReturnType<typeof createCharacter>) => ({ ...c, states: { ROOT: { value: 1, touchedRound: 0 } } });
        const hitFace = { description: 'hit', priority: 0, effects: [{ label: EffectLabel.Damage, magnitude: 5, targets: [{ side: 'ENEMY' as const, mode: 'ABSOLUTE' as const, n: [0] }], impl: new Damage(5) }] };
        const attacker = rooted(createCharacter({ catalogId: TEST_CATALOG_ID, name: 'att', maxHp: 20, baseSpeed: 5, baseDie: Array(6).fill(hitFace) as unknown as Die, position: { playerIndex: 0, slot: 0 } }));
        const victim = rooted(createCharacter({ catalogId: TEST_CATALOG_ID, name: 'vic', maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: 1, slot: 0 } }));
        const gs = addAllEffectsToPriorityQueue(createGameState(createPlayer([attacker], 0), createPlayer([victim], 1)));

        const { state, log } = unstackPriorityQueueWithLog(gs);

        expect(log.find(step => step.characterId === attacker.id)).toMatchObject({ skipped: false });
        expect(state.players[1].team[0].hp).toBe(15);
    });

    it('an actor that swaps itself while rooted stays in place', () => {
        const base = createGameState(five(0, 'A'), five(1, 'B'));
        const gs = root(base, 0, 1);
        const rooted = occupant(gs, 0, 1)!;
        const moveFace = { description: 'move', priority: 0, effects: [{ label: EffectLabel.Swap, magnitude: 0, targets: [{ side: 'ALLY' as const, mode: 'RELATIVE' as const, n: [0] }, { side: 'ALLY' as const, mode: 'ABSOLUTE' as const, n: [0] }], impl: new Swap() }] };
        const withFace = { ...gs, players: [{ ...gs.players[0], team: gs.players[0].team.map(c => c.id === rooted.id ? { ...c, face: moveFace } : { ...c, face: { description: 'rest', priority: 0, effects: [] } }) }, gs.players[1]] as GameState['players'] };

        const { state } = unstackPriorityQueueWithLog(addAllEffectsToPriorityQueue(withFace));

        expect(occupant(state, 0, 1)!.id).toBe(rooted.id);
    });
});
