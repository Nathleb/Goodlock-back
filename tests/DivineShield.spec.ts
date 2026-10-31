import { TEST_CATALOG_ID } from './helpers/catalog';
import Damage from "@domain/strategies/Damage.class";
import EffectLabel from "@domain/types/EffectLabels.type";
import { addAllEffectsToPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import FixedDamage from "@domain/strategies/FixedDamage.class";
import Heal from "@domain/strategies/Heal.class";
import Shield from "@domain/strategies/Shield.class";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "./helpers/gameState";
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

    it('is not consumed by a hit already floored to 0 by ARMOR', () => {
        const target = patch(gs, 1, 0, { ...shielded(), modifiers: [{ stat: 'ARMOR', value: 9, roundsLeft: 2, appliedRound: 0 }] });

        const { state } = new Damage(5).solve(target, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(20);
        expect(at(state, 1, 0).states.DIVINE_SHIELD?.value).toBe(1);
    });

    it("counts the actor's POWER before deciding whether the hit would hurt", () => {
        const target = patch(gs, 1, 0, { ...shielded(), modifiers: [{ stat: 'ARMOR', value: 9, roundsLeft: 2, appliedRound: 0 }] });
        const empowered = patch(target, 0, 2, { modifiers: [{ stat: 'POWER', value: 5, roundsLeft: 2, appliedRound: 0 }] });

        const { state } = new Damage(5).solve(empowered, [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(20);
        expect(at(state, 1, 0).states).toEqual({});
    });

    it('a repeated cell consumes it once, then the second occurrence lands', () => {
        const { state } = new Damage(5).solve(patch(gs, 1, 0, shielded()), [pos(1, 0), pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(15);
        expect(at(state, 1, 0).states).toEqual({});
    });

    it('protects only the shielded cell of an area pattern', () => {
        const { state } = new Damage(5).solve(patch(gs, 1, 1, shielded()), [pos(1, 0), pos(1, 1), pos(1, 2)], actorId());

        expect([0, 1, 2].map(i => at(state, 1, i).hp)).toEqual([15, 20, 15]);
        expect(at(state, 1, 1).states).toEqual({});
    });

    it('lets the hit land on a target without it', () => {
        const { state } = new Damage(5).solve(gs, [pos(1, 0)], actorId());
        expect(at(state, 1, 0).hp).toBe(15);
    });

    it('spends the whole counter, whatever its duration', () => {
        const { state } = new Damage(5).solve(patch(gs, 1, 0, shielded(3)), [pos(1, 0)], actorId());
        expect(at(state, 1, 0).states).toEqual({});
    });

    it('works on an ally cell too', () => {
        const { state } = new Damage(5).solve(patch(gs, 0, 0, shielded()), [pos(0, 0)], actorId());

        expect(at(state, 0, 0).hp).toBe(20);
        expect(at(state, 0, 0).states).toEqual({});
    });

    it('nullifies the hit before the armour shield absorbs anything', () => {
        const { state } = new Damage(5).solve(patch(gs, 1, 0, { ...shielded(), shield: 6 }), [pos(1, 0)], actorId());

        expect(at(state, 1, 0).shield).toBe(6);
        expect(at(state, 1, 0).hp).toBe(20);
    });

    it('is not consumed by a hit on a dead character', () => {
        const { state } = new Damage(5).solve(patch(gs, 1, 0, { ...shielded(), hp: 0 }), [pos(1, 0)], actorId());
        expect(at(state, 1, 0).states.DIVINE_SHIELD?.value).toBe(1);
    });

    it('is ignored by FixedDamage, which does not consume it', () => {
        const { state } = new FixedDamage(5).solve(patch(gs, 1, 0, shielded()), [pos(1, 0)], actorId());

        expect(at(state, 1, 0).hp).toBe(15);
        expect(at(state, 1, 0).states.DIVINE_SHIELD?.value).toBe(1);
    });

    it('does not affect Heal or Shield, and is kept', () => {
        const hurt = patch(gs, 1, 0, { ...shielded(), hp: 10 });

        const healed = new Heal(5).solve(hurt, [pos(1, 0)], actorId()).state;
        const walled = new Shield(4).solve(hurt, [pos(1, 0)], actorId()).state;

        expect(at(healed, 1, 0).hp).toBe(15);
        expect(at(walled, 1, 0).shield).toBe(4);
        expect(at(healed, 1, 0).states.DIVINE_SHIELD?.value).toBe(1);
        expect(at(walled, 1, 0).states.DIVINE_SHIELD?.value).toBe(1);
    });

    it('shows up in the resolve log: the nullified target is listed with its shield spent and hp intact', () => {
        const hitFace = { description: 'hit', priority: 0, effects: [{ label: EffectLabel.Damage, magnitude: 5, targets: [{ side: 'ENEMY' as const, mode: 'ABSOLUTE' as const, n: [0] }] }] };
        const attacker = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'att', maxHp: 20, baseSpeed: 5, baseDie: Array(6).fill(hitFace) as unknown as Die, position: { playerIndex: 0, slot: 0 } });
        const victim = { ...createCharacter({ catalogId: TEST_CATALOG_ID, name: 'vic', maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: 1, slot: 0 } }), ...shielded() };
        const start = addAllEffectsToPriorityQueue(createGameState(createPlayer([attacker], 0), createPlayer([victim], 1)));

        const { state, log } = unstackPriorityQueueWithLog(start);

        const step = log.find(entry => entry.characterId === attacker.id)!;
        expect(step.skipped).toBe(false);
        expect(step.changes).toHaveLength(1);
        expect(step.changes[0].character).toMatchObject({ id: victim.id, hp: 20 });
        expect(step.changes[0].character.states).toEqual({});
        expect(state.players[1].team[0].hp).toBe(20);
    });
});
