import { TEST_CATALOG_ID } from './helpers/catalog';
import Swap from "@domain/strategies/Swap.class";
import EffectLabel from "@domain/types/EffectLabels.type";
import { BaseDieInstructions, EffectEntry } from "@domain/types/BaseDieInstructions.type";
import { addAllEffectsToPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "./helpers/gameState";
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

        const [mover, rooted] = [occupant(gs, 0, 1)!.id, occupant(gs, 0, 2)!.id];

        const { state, affected } = new Swap().solve(gs, [pos(0, 1), pos(0, 2)], mover);

        expect(affected).toEqual([]);
        expect(occupant(state, 0, 1)!.id).toBe(mover);
        expect(occupant(state, 0, 2)!.id).toBe(rooted);
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
        const hitFace = { description: 'hit', priority: 0, effects: [{ label: EffectLabel.Damage, magnitude: 5, targets: [{ side: 'ENEMY' as const, mode: 'ABSOLUTE' as const, n: [0] }] }] };
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
        const moveFace = { description: 'move', priority: 0, effects: [{ label: EffectLabel.Swap, magnitude: 0, targets: [{ side: 'ALLY' as const, mode: 'RELATIVE' as const, n: [0] }, { side: 'ALLY' as const, mode: 'ABSOLUTE' as const, n: [0] }] }] };
        const withFace = { ...gs, players: [{ ...gs.players[0], team: gs.players[0].team.map(c => c.id === rooted.id ? { ...c, face: moveFace } : { ...c, face: { description: 'rest', priority: 0, effects: [] } }) }, gs.players[1]] as GameState['players'] };

        const { state } = unstackPriorityQueueWithLog(addAllEffectsToPriorityQueue(withFace));

        expect(occupant(state, 0, 1)!.id).toBe(rooted.id);
    });

    it('a dead character is no longer rooted: Swaps into or out of its cell work', () => {
        const base = root(createGameState(five(0, 'A'), five(1, 'B')), 0, 2);
        const gs: GameState = {
            ...base,
            players: [{ ...base.players[0], team: base.players[0].team.map(c => c.position.slot === 2 ? { ...c, hp: 0 } : c) }, base.players[1]],
        };
        const [alive, dead] = [occupant(gs, 0, 1)!.id, occupant(gs, 0, 2)!.id];

        const { state, affected } = new Swap().solve(gs, [pos(0, 1), pos(0, 2)], alive);

        expect(affected.sort()).toEqual([alive, dead].sort());
        expect(occupant(state, 0, 2)!.id).toBe(alive);
        expect(occupant(state, 0, 1)!.id).toBe(dead);
    });

    describe('applied inside the resolution', () => {
        const hero = (name: string, speed: number, playerIndex: PlayerIndex, slot: SlotIndex, effects: EffectEntry[]) =>
            createCharacter({
                catalogId: TEST_CATALOG_ID, name, maxHp: 100, baseSpeed: speed, position: { playerIndex, slot },
                baseDie: generateFullDie(Array(6).fill({ description: 'f', priority: 0, effects }) as unknown as BaseDieInstructions),
            });
        const rootEnemy: EffectEntry = { effect: EffectLabel.ApplyState, state: 'ROOT', duration: 1, targets: [{ side: 'ENEMY', mode: 'ABSOLUTE', n: [0] }] };
        const moveRight: EffectEntry = { effect: EffectLabel.Swap, magnitude: 0, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }, { side: 'ALLY', mode: 'ABSOLUTE', n: [1] }] };
        const resolveWith = (rooterSpeed: number) => {
            const rooter = hero('rooter', rooterSpeed, 0, 0, [rootEnemy]);
            const mover = hero('mover', 5, 1, 0, [moveRight]);
            const buddy = hero('buddy', 1, 1, 1, []);
            const gs = addAllEffectsToPriorityQueue(createGameState(createPlayer([rooter], 0), createPlayer([mover, buddy], 1)));
            return { moverId: mover.id, state: unstackPriorityQueueWithLog(gs).state };
        };

        it('a ROOT applied earlier in the resolution cancels a later Swap of the same round', () => {
            const { moverId, state } = resolveWith(9);
            expect(occupant(state, 1, 0)!.id).toBe(moverId);
        });

        it('a ROOT applied after the Swap does not undo it', () => {
            const { moverId, state } = resolveWith(1);
            expect(occupant(state, 1, 1)!.id).toBe(moverId);
        });
    });
});
