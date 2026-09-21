import Damage from "@domain/strategies/Damage.class";
import Heal from "@domain/strategies/Heal.class";
import Shield from "@domain/strategies/Shield.class";
import { Swap } from "@domain/strategies/Swap.class";
import { applyAtPositions } from "@domain/utils/TargetUtils";
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
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter(`${prefix}${i}`, 20, 1, EMPTY_DIE, { playerIndex: pi, slot: i as SlotIndex })), pi);

let gs: GameState;
beforeEach(() => { gs = createGameState(team(0, 'A'), team(1, 'B')); });

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });
const withHp = (s: GameState, pi: PlayerIndex, slot: number, hp: number): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? { ...c, hp } : c) };
    return { ...s, players };
};
const actorId = () => at(gs, 0, 2).id;

describe('applyAtPositions', () => {
    it('applies once per occurrence and lists each affected id once, in first-touch order', () => {
        const { state, affected } = applyAtPositions(gs, [pos(1, 0), pos(0, 3), pos(1, 0)], c => gainShield(c, 1));
        expect(at(state, 1, 0).shield).toBe(2);
        expect(at(state, 0, 3).shield).toBe(1);
        expect(affected).toEqual([at(gs, 1, 0).id, at(gs, 0, 3).id]);
    });

    it('returns the state untouched for no positions', () => {
        expect(applyAtPositions(gs, [], c => gainShield(c, 1)).affected).toEqual([]);
    });
});

describe('Damage', () => {
    it('damages every occupant of the given cells, across both teams', () => {
        const { state, affected } = new Damage(5).solve(gs, [pos(1, 0), pos(1, 1), pos(0, 2)], actorId());
        expect(at(state, 1, 0).hp).toBe(15);
        expect(at(state, 1, 1).hp).toBe(15);
        expect(at(state, 0, 2).hp).toBe(15);
        expect(at(state, 1, 2).hp).toBe(20);
        expect(affected).toHaveLength(3);
    });

    it('is absorbed by shield first', () => {
        const shielded = new Shield(3).solve(gs, [pos(1, 0)], actorId()).state;
        const { state } = new Damage(5).solve(shielded, [pos(1, 0)], actorId());
        expect(at(state, 1, 0).shield).toBe(0);
        expect(at(state, 1, 0).hp).toBe(18);
    });

    it('hits a dead occupant without effect on hp (damage wasted)', () => {
        const dead = withHp(gs, 1, 0, 0);
        const { state } = new Damage(5).solve(dead, [pos(1, 0)], actorId());
        expect(at(state, 1, 0).hp).toBe(0);
    });

    it('hits a repeated cell once per occurrence (stacking)', () => {
        const { state, affected } = new Damage(5).solve(gs, [pos(1, 2), pos(1, 2)], actorId());
        expect(at(state, 1, 2).hp).toBe(10);
        expect(affected).toEqual([at(gs, 1, 2).id]);
    });

    it('a repeated cell hits shield then hp in sequence', () => {
        const shielded = new Shield(3).solve(gs, [pos(1, 0)], actorId()).state;
        const { state } = new Damage(2).solve(shielded, [pos(1, 0), pos(1, 0)], actorId());
        expect(at(state, 1, 0).shield).toBe(0);
        expect(at(state, 1, 0).hp).toBe(19);
    });

    it('hits all 10 characters when given all 10 cells', () => {
        const all = [0, 1].flatMap(pi => [0, 1, 2, 3, 4].map(s => pos(pi as PlayerIndex, s)));
        const { state, affected } = new Damage(1).solve(gs, all, actorId());
        expect(affected).toHaveLength(10);
        expect(state.players.every(p => p.team.every(c => c.hp === 19))).toBe(true);
    });
});

describe('Heal', () => {
    it('heals occupants up to maxHp', () => {
        const hurt = withHp(gs, 0, 1, 10);
        const { state } = new Heal(15).solve(hurt, [pos(0, 1)], actorId());
        expect(at(state, 0, 1).hp).toBe(20);
    });

    it('does not revive a dead occupant', () => {
        const dead = withHp(gs, 0, 1, 0);
        const { state } = new Heal(5).solve(dead, [pos(0, 1)], actorId());
        expect(at(state, 0, 1).hp).toBe(0);
    });

    it('heals a repeated cell once per occurrence', () => {
        const hurt = withHp(gs, 0, 1, 10);
        const { state } = new Heal(3).solve(hurt, [pos(0, 1), pos(0, 1)], actorId());
        expect(at(state, 0, 1).hp).toBe(16);
    });
});

describe('Shield', () => {
    it('adds shield to every occupant', () => {
        const { state } = new Shield(4).solve(gs, [pos(0, 0), pos(0, 4)], actorId());
        expect(at(state, 0, 0).shield).toBe(4);
        expect(at(state, 0, 4).shield).toBe(4);
        expect(at(state, 0, 2).shield).toBe(0);
    });

    it('shields a repeated cell once per occurrence', () => {
        const { state } = new Shield(4).solve(gs, [pos(0, 0), pos(0, 0)], actorId());
        expect(at(state, 0, 0).shield).toBe(8);
    });
});

describe('Swap', () => {
    it('exchanges the occupants of 2 cells on the same team and keeps slots consistent', () => {
        const a = at(gs, 1, 1).id, b = at(gs, 1, 3).id;
        const { state, affected } = new Swap().solve(gs, [pos(1, 1), pos(1, 3)], actorId());
        expect(at(state, 1, 1).id).toBe(b);
        expect(at(state, 1, 3).id).toBe(a);
        expect(at(state, 1, 1).position.slot).toBe(1);
        expect(at(state, 1, 3).position.slot).toBe(3);
        expect(affected.sort()).toEqual([a, b].sort());
    });

    it('fizzles with fewer or more than 2 cells', () => {
        expect(new Swap().solve(gs, [pos(1, 1)], actorId())).toEqual({ state: gs, affected: [] });
        expect(new Swap().solve(gs, [pos(1, 1), pos(1, 2), pos(1, 3)], actorId())).toEqual({ state: gs, affected: [] });
    });

    it('is a no-op when both cells are the same', () => {
        expect(new Swap().solve(gs, [pos(1, 1), pos(1, 1)], actorId()).affected).toEqual([]);
    });

    it('fizzles when the 2 cells are on different teams', () => {
        expect(new Swap().solve(gs, [pos(0, 1), pos(1, 1)], actorId())).toEqual({ state: gs, affected: [] });
    });

    it('can move a dead character', () => {
        const dead = withHp(gs, 0, 0, 0);
        const deadId = at(dead, 0, 0).id;
        const { state } = new Swap().solve(dead, [pos(0, 0), pos(0, 4)], actorId());
        expect(at(state, 0, 4).id).toBe(deadId);
    });
});
