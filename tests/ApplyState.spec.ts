import { TEST_CATALOG_ID } from './helpers/catalog';
import ApplyState from "@domain/strategies/ApplyState.class";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "./helpers/gameState";
import { createPlayer } from "@domain/services/Player.service";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import Position, { PlayerIndex, SlotIndex } from "@domain/types/Position.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const team = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });

let gs: GameState;
beforeEach(() => { gs = { ...createGameState(team(0, 'A'), team(1, 'B')), currentRound: 3 }; });
const actorId = () => at(gs, 0, 2).id;

describe('ApplyState', () => {
    it('puts the signed duration on the state axis, stamped with the current round', () => {
        const { state, affected } = new ApplyState('HASTE', 3).solve(gs, [pos(0, 1)], actorId());

        expect(at(state, 0, 1).states).toEqual({ SPEED: { value: 3, touchedRound: 3 } });
        expect(affected).toEqual([at(gs, 0, 1).id]);
    });

    it('pushes the inverse state in the negative direction of the same axis', () => {
        const { state } = new ApplyState('POISON', 2).solve(gs, [pos(0, 1)], actorId());
        expect(at(state, 0, 1).states).toEqual({ VITALITY: { value: -2, touchedRound: 3 } });
    });

    it('lets opposite states fight over the duration: Haste 3 then Slow 2 leaves Haste 1', () => {
        const hasted = new ApplyState('HASTE', 3).solve(gs, [pos(0, 1)], actorId()).state;
        const fought = new ApplyState('SLOW', 2).solve(hasted, [pos(0, 1)], actorId()).state;
        expect(at(fought, 0, 1).states.SPEED?.value).toBe(1);
    });

    it('flips the sign when the inverse state is longer: Haste 1 then Slow 3 leaves Slow 2', () => {
        const hasted = new ApplyState('HASTE', 1).solve(gs, [pos(0, 1)], actorId()).state;
        const flipped = new ApplyState('SLOW', 3).solve(hasted, [pos(0, 1)], actorId()).state;
        expect(at(flipped, 0, 1).states.SPEED?.value).toBe(-2);
    });

    it('removes the axis when opposite states cancel exactly', () => {
        const hasted = new ApplyState('HASTE', 2).solve(gs, [pos(0, 1)], actorId()).state;
        const cancelled = new ApplyState('SLOW', 2).solve(hasted, [pos(0, 1)], actorId()).state;
        expect(at(cancelled, 0, 1).states).toEqual({});
    });

    it('adds up applications in the same direction: Stun 1 twice is Stun 2', () => {
        const once = new ApplyState('STUN', 1).solve(gs, [pos(0, 1)], actorId()).state;
        const twice = new ApplyState('STUN', 1).solve(once, [pos(0, 1)], actorId()).state;
        expect(at(twice, 0, 1).states.STUN?.value).toBe(2);
    });

    it('stamps the axis again each time it is touched', () => {
        const early = new ApplyState('STUN', 1).solve(gs, [pos(0, 1)], actorId()).state;
        const later = new ApplyState('STUN', 1).solve({ ...early, currentRound: 5 }, [pos(0, 1)], actorId()).state;
        expect(at(later, 0, 1).states.STUN?.touchedRound).toBe(5);
    });

    it('applies once per occurrence of a repeated cell', () => {
        const { state } = new ApplyState('STUN', 1).solve(gs, [pos(0, 1), pos(0, 1)], actorId());
        expect(at(state, 0, 1).states.STUN?.value).toBe(2);
    });

    it('does nothing on an empty cell while the rest of the pattern applies', () => {
        const four = (pi: PlayerIndex, prefix: string) => createPlayer([0, 1, 2, 3].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);
        const holed = createGameState(four(0, 'A'), four(1, 'B'));

        const { state } = new ApplyState('ROOT', 2).solve(holed, [pos(1, 4), pos(1, 3)], holed.players[0].team[0].id);

        expect(state.players[1].team.find(c => c.position.slot === 3)!.states.ROOT?.value).toBe(2);
    });

    it('gives nothing to a dead occupant', () => {
        const withDead: GameState = {
            ...gs,
            players: [gs.players[0], { ...gs.players[1], team: gs.players[1].team.map((c, i) => i === 0 ? { ...c, hp: 0 } : c) }],
        };

        const { state } = new ApplyState('STUN', 1).solve(withDead, [pos(1, 0), pos(1, 1)], actorId());

        expect(at(state, 1, 0).states).toEqual({});
        expect(at(state, 1, 1).states.STUN?.value).toBe(1);
    });
});
