import { TEST_CATALOG_ID } from './helpers/catalog';
import Damage from "@domain/strategies/Damage.class";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import Modifier, { StatName } from "@domain/types/Modifier.type";
import Position, { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { Player } from "@domain/types/Player.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const team = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });
const stat = (name: StatName, value: number): Modifier => ({ stat: name, value, roundsLeft: 2, appliedRound: 0 });
const withCharacter = (s: GameState, pi: PlayerIndex, slot: number, patch: Partial<Player['team'][number]>): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? { ...c, ...patch } : c) };
    return { ...s, players };
};

let gs: GameState;
beforeEach(() => { gs = createGameState(team(0, 'A'), team(1, 'B')); });
const actorId = () => at(gs, 0, 2).id;

describe('Damage with ARMOR', () => {
    it("subtracts the target's ARMOR from the damage taken", () => {
        const armored = withCharacter(gs, 1, 0, { modifiers: [stat('ARMOR', 3)] });

        const { state } = new Damage(5).solve(armored, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(18);
    });

    it('floors the damage at 0 under a strong ARMOR, never healing or adding shield', () => {
        const wall = withCharacter(gs, 1, 0, { modifiers: [stat('ARMOR', 9)] });

        const { state } = new Damage(5).solve(wall, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(20);
        expect(at(state, 1, 0).shield).toBe(0);
    });

    it('a negative ARMOR (Vulnerable) increases the damage taken', () => {
        const exposed = withCharacter(gs, 1, 0, { modifiers: [stat('ARMOR', -3)] });

        const { state } = new Damage(5).solve(exposed, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(12);
    });

    it("combines the actor's POWER and the target's ARMOR under a single floor", () => {
        const empowered = withCharacter(withCharacter(gs, 0, 2, { modifiers: [stat('POWER', 2)] }), 1, 0, { modifiers: [stat('ARMOR', 4)] });
        const { state } = new Damage(5).solve(empowered, [pos(1, 0)], actorId());
        expect(at(state, 1, 0).hp).toBe(17);

        const crossed = withCharacter(withCharacter(gs, 0, 2, { modifiers: [stat('POWER', -9)] }), 1, 0, { modifiers: [stat('ARMOR', -3)] });
        const { state: floored } = new Damage(5).solve(crossed, [pos(1, 0)], actorId());
        expect(at(floored, 1, 0).hp).toBe(20);
    });

    it('reads ARMOR on each target cell, so an area pattern is reduced cell by cell', () => {
        const guarded = withCharacter(gs, 1, 1, { modifiers: [stat('ARMOR', 8)] });

        const { state } = new Damage(7).solve(guarded, [pos(1, 0), pos(1, 1), pos(1, 2)], actorId());

        expect(at(state, 1, 0).hp).toBe(13);
        expect(at(state, 1, 1).hp).toBe(20);
        expect(at(state, 1, 2).hp).toBe(13);
    });

    it('is applied before the shield absorbs the remaining damage', () => {
        const shielded = withCharacter(gs, 1, 0, { modifiers: [stat('ARMOR', 3)], shield: 6 });

        const { state } = new Damage(5).solve(shielded, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).shield).toBe(4);
        expect(at(state, 1, 0).hp).toBe(20);
    });
});
