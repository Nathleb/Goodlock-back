import { TEST_CATALOG_ID } from './helpers/catalog';
import ApplyStat from "@domain/strategies/ApplyStat.class";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
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

describe('ApplyStat', () => {
    it('adds one instance to the target, stamped with the current round', () => {
        const { state, affected } = new ApplyStat('POWER', 3, 2).solve(gs, [pos(0, 1)], actorId());

        expect(at(state, 0, 1).modifiers).toEqual([{ stat: 'POWER', value: 3, roundsLeft: 2, appliedRound: 3 }]);
        expect(affected).toEqual([at(gs, 0, 1).id]);
    });

    it('adds one instance per occurrence of a repeated cell', () => {
        const { state } = new ApplyStat('POWER', 3, 2).solve(gs, [pos(0, 1), pos(0, 1)], actorId());
        expect(at(state, 0, 1).modifiers).toHaveLength(2);
    });

    it('stacks with the instances already there', () => {
        const once = new ApplyStat('POWER', 3, 2).solve(gs, [pos(0, 1)], actorId()).state;
        const twice = new ApplyStat('POWER', -1, 1).solve(once, [pos(0, 1)], actorId()).state;
        expect(at(twice, 0, 1).modifiers.map(m => m.value)).toEqual([3, -1]);
    });

    it('gives no instance to a dead occupant', () => {
        const withDead: GameState = {
            ...gs,
            players: [gs.players[0], { ...gs.players[1], team: gs.players[1].team.map((c, i) => i === 0 ? { ...c, hp: 0 } : c) }],
        };

        const { state } = new ApplyStat('POWER', 3, 2).solve(withDead, [pos(1, 0), pos(1, 1)], actorId());

        expect(at(state, 1, 0).modifiers).toEqual([]);
        expect(at(state, 1, 1).modifiers).toHaveLength(1);
    });

    it('does nothing on an empty cell while the rest of the pattern applies', () => {
        const four = (pi: PlayerIndex, prefix: string) => createPlayer([0, 1, 2, 3].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);
        const holed = createGameState(four(0, 'A'), four(1, 'B'));

        const { state, affected } = new ApplyStat('POWER', 3, 2).solve(holed, [pos(1, 4), pos(1, 3)], holed.players[0].team[0].id);

        expect(state.players[1].team.find(c => c.position.slot === 3)!.modifiers).toHaveLength(1);
        expect(affected).toEqual([holed.players[1].team[3].id]);
    });
});
