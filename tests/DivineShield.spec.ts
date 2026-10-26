import { TEST_CATALOG_ID } from './helpers/catalog';
import Damage from "@domain/strategies/Damage.class";
import FixedDamage from "@domain/strategies/FixedDamage.class";
import Heal from "@domain/strategies/Heal.class";
import Shield from "@domain/strategies/Shield.class";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import Position, { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { Player } from "@domain/types/Player.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const team = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });
const patch = (s: GameState, pi: PlayerIndex, slot: number, change: Partial<Player['team'][number]>): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? { ...c, ...change } : c) };
    return { ...s, players };
};
const shielded = (value = 1) => ({ states: { DIVINE_SHIELD: { value, touchedRound: 0 } } });

let gs: GameState;
beforeEach(() => { gs = createGameState(team(0, 'A'), team(1, 'B')); });
const actorId = () => at(gs, 0, 2).id;

describe('DIVINE_SHIELD', () => {
    it('nullifies a Damage hit and is consumed', () => {
        const protectedTarget = patch(gs, 1, 0, shielded());

        const { state } = new Damage(5).solve(protectedTarget, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(20);
        expect(at(state, 1, 0).states).toEqual({});
    });
});
