import { TEST_CATALOG_ID } from './helpers/catalog';
import Swap from "@domain/strategies/Swap.class";
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
});
