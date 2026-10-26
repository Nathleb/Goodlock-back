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
});
