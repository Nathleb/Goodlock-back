import { TEST_CATALOG_ID } from './helpers/catalog';
import Damage from "@domain/strategies/Damage.class";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import Modifier from "@domain/types/Modifier.type";
import Position, { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { Player } from "@domain/types/Player.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const team = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });
const power = (value: number): Modifier => ({ stat: 'POWER', value, roundsLeft: 2, appliedRound: 0 });
const withCharacter = (s: GameState, pi: PlayerIndex, slot: number, patch: Partial<Player['team'][number]>): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? { ...c, ...patch } : c) };
    return { ...s, players };
};

let gs: GameState;
beforeEach(() => { gs = createGameState(team(0, 'A'), team(1, 'B')); });

describe('Damage with POWER', () => {
    it("adds the actor's POWER to the damage dealt", () => {
        const buffed = withCharacter(gs, 0, 2, { modifiers: [power(3)] });

        const { state } = new Damage(5).solve(buffed, [pos(1, 0)], at(buffed, 0, 2).id);

        expect(at(state, 1, 0).hp).toBe(12);
    });
});
