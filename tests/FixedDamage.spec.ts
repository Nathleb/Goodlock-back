import { TEST_CATALOG_ID } from './helpers/catalog';
import FixedDamage from "@domain/strategies/FixedDamage.class";
import { gainShield } from "@domain/services/Character.service";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import Position, { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { Player } from "@domain/types/Player.type";

// Shape-agnostic die: effects never read the die, so its face content is irrelevant.
const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const team = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

let gs: GameState;
beforeEach(() => { gs = createGameState(team(0, 'A'), team(1, 'B')); });

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });
const withShield = (s: GameState, pi: PlayerIndex, slot: number, amount: number): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? gainShield(c, amount) : c) };
    return { ...s, players };
};
const withHp = (s: GameState, pi: PlayerIndex, slot: number, hp: number): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? { ...c, hp } : c) };
    return { ...s, players };
};
const actorId = () => at(gs, 0, 2).id;

describe('FixedDamage', () => {
    it('lowers hp by the full magnitude and leaves the shield untouched', () => {
        const shielded = withShield(gs, 1, 0, 8);

        const { state } = new FixedDamage(5).solve(shielded, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(15);
        expect(at(state, 1, 0).shield).toBe(8);
    });

    it('hits a repeated cell once per occurrence (stacking)', () => {
        const { state, affected } = new FixedDamage(5).solve(gs, [pos(1, 2), pos(1, 2)], actorId());
        expect(at(state, 1, 2).hp).toBe(10);
        expect(affected).toEqual([at(gs, 1, 2).id]);
    });

    it('leaves a dead occupant at 0 hp', () => {
        const { state } = new FixedDamage(5).solve(withHp(gs, 1, 0, 0), [pos(1, 0)], actorId());
        expect(at(state, 1, 0).hp).toBe(0);
    });

    it('works on an ALLY cell as a self-cost, shield untouched', () => {
        const shielded = withShield(gs, 0, 2, 4);
        const { state } = new FixedDamage(3).solve(shielded, [pos(0, 2)], actorId());
        expect(at(state, 0, 2).hp).toBe(17);
        expect(at(state, 0, 2).shield).toBe(4);
    });

    it('does nothing on an empty cell while the rest of the pattern applies', () => {
        const four = (pi: PlayerIndex, prefix: string) => createPlayer([0, 1, 2, 3].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);
        const holed = createGameState(four(0, 'A'), four(1, 'B'));
        const { state, affected } = new FixedDamage(5).solve(holed, [pos(1, 4), pos(1, 3)], holed.players[0].team[0].id);
        expect(state.players[1].team.find(c => c.position.slot === 3)!.hp).toBe(15);
        expect(affected).toEqual([holed.players[1].team[3].id]);
    });

    it('ignores the actor\'s POWER, buff or debuff', () => {
        const power = (value: number) => ({ stat: 'POWER' as const, value, roundsLeft: 2, appliedRound: 0 });
        const withActorPower = (value: number): GameState => {
            const players = [...gs.players] as [Player, Player];
            players[0] = { ...players[0], team: players[0].team.map((c, i) => i === 2 ? { ...c, modifiers: [power(value)] } : c) };
            return { ...gs, players };
        };

        const buffed = new FixedDamage(5).solve(withActorPower(7), [pos(1, 0)], actorId()).state;
        const weakened = new FixedDamage(5).solve(withActorPower(-9), [pos(1, 0)], actorId()).state;

        expect(at(buffed, 1, 0).hp).toBe(15);
        expect(at(weakened, 1, 0).hp).toBe(15);
    });

    it("ignores the target's ARMOR, buff or debuff", () => {
        const withTargetArmor = (value: number): GameState => {
            const players = [...gs.players] as [Player, Player];
            players[1] = { ...players[1], team: players[1].team.map((c, i) => i === 0 ? { ...c, modifiers: [{ stat: 'ARMOR' as const, value, roundsLeft: 2, appliedRound: 0 }] } : c) };
            return { ...gs, players };
        };

        const armored = new FixedDamage(5).solve(withTargetArmor(7), [pos(1, 0)], actorId()).state;
        const exposed = new FixedDamage(5).solve(withTargetArmor(-9), [pos(1, 0)], actorId()).state;

        expect(at(armored, 1, 0).hp).toBe(15);
        expect(at(exposed, 1, 0).hp).toBe(15);
    });
});
