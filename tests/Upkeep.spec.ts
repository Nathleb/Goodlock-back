import { TEST_CATALOG_ID } from './helpers/catalog';
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { upkeep, POISON_DAMAGE, REGEN_HEAL } from "@domain/services/Upkeep.service";
import { endOfRound } from "@domain/services/Round.service";
import ApplyState from "@domain/strategies/ApplyState.class";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { Player } from "@domain/types/Player.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const team = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: `${prefix}${i}`, maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const patch = (s: GameState, pi: PlayerIndex, slot: number, change: Partial<Player['team'][number]>): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? { ...c, ...change } : c) };
    return { ...s, players };
};
const vitality = (value: number) => ({ states: { VITALITY: { value, touchedRound: 0 } } });

let gs: GameState;
beforeEach(() => { gs = createGameState(team(0, 'A'), team(1, 'B')); });

describe('upkeep', () => {
    it('POISON removes POISON_DAMAGE hit points', () => {
        const poisoned = patch(gs, 0, 1, vitality(-2));

        const after = upkeep(poisoned);

        expect(POISON_DAMAGE).toBe(5);
        expect(at(after, 0, 1).hp).toBe(20 - POISON_DAMAGE);
    });

    it('REGEN heals REGEN_HEAL hit points', () => {
        const regenerating = patch(gs, 0, 1, { ...vitality(2), hp: 10 });

        const after = upkeep(regenerating);

        expect(REGEN_HEAL).toBe(5);
        expect(at(after, 0, 1).hp).toBe(10 + REGEN_HEAL);
    });

    it('REGEN never heals above max hit points', () => {
        const nearlyFull = patch(gs, 0, 1, { ...vitality(1), hp: 18 });
        expect(at(upkeep(nearlyFull), 0, 1).hp).toBe(20);
    });

    it('REGEN never revives a dead character', () => {
        const dead = patch(gs, 0, 1, { ...vitality(2), hp: 0 });
        expect(at(upkeep(dead), 0, 1).hp).toBe(0);
    });

    it('does nothing to a character without a VITALITY counter', () => {
        const after = upkeep(patch(gs, 0, 1, { hp: 12 }));
        expect(at(after, 0, 1).hp).toBe(12);
    });

    it('hurts once per round whatever the remaining duration', () => {
        expect(at(upkeep(patch(gs, 0, 1, vitality(-4))), 0, 1).hp).toBe(15);
    });

    it('POISON ignores ARMOR, the armour shield and DIVINE_SHIELD, and does not consume it', () => {
        const protectedTarget = patch(gs, 0, 1, {
            states: { VITALITY: { value: -1, touchedRound: 0 }, DIVINE_SHIELD: { value: 1, touchedRound: 0 } },
            modifiers: [{ stat: 'ARMOR', value: 9, roundsLeft: 2, appliedRound: 0 }],
            shield: 8,
        });

        const after = at(upkeep(protectedTarget), 0, 1);

        expect(after.hp).toBe(15);
        expect(after.shield).toBe(8);
        expect(after.states.DIVINE_SHIELD?.value).toBe(1);
    });

    it('leaves the counters untouched: they tick at the end of the round', () => {
        const poisoned = patch(gs, 0, 1, vitality(-2));
        expect(at(upkeep(poisoned), 0, 1).states).toEqual({ VITALITY: { value: -2, touchedRound: 0 } });
    });

    it('applies to both teams', () => {
        const both = patch(patch(gs, 0, 0, vitality(-1)), 1, 3, { ...vitality(1), hp: 10 });
        const after = upkeep(both);
        expect(at(after, 0, 0).hp).toBe(15);
        expect(at(after, 1, 3).hp).toBe(15);
    });
});

describe('upkeep timeline', () => {
    const nextRoundStart = (s: GameState) => upkeep(endOfRound(s));
    const applyAt = (s: GameState, state: 'POISON' | 'REGEN', duration: number) =>
        new ApplyState(state, duration).solve(s, [{ playerIndex: 0, slot: 1 }], s.players[0].team[0].id).state;

    it('a POISON of duration d applied in round N hurts at the start of rounds N+1 to N+d, and only those', () => {
        let state: GameState = { ...createGameState(team(0, 'A'), team(1, 'B')), currentRound: 4 };
        state = applyAt(state, 'POISON', 2);
        const hp: number[] = [state.players[0].team[1].hp];

        for (let i = 0; i < 3; i++) {
            state = nextRoundStart(state);
            hp.push(state.players[0].team[1].hp);
        }

        expect(hp).toEqual([20, 15, 10, 10]);
    });

    it('a REGEN of duration 1 applied in round N heals once, at the start of round N+1', () => {
        let state: GameState = { ...createGameState(team(0, 'A'), team(1, 'B')), currentRound: 4 };
        state = { ...state, players: [{ ...state.players[0], team: state.players[0].team.map((c, i) => i === 1 ? { ...c, hp: 5 } : c) }, state.players[1]] };
        state = applyAt(state, 'REGEN', 1);
        const hp: number[] = [state.players[0].team[1].hp];

        for (let i = 0; i < 2; i++) {
            state = nextRoundStart(state);
            hp.push(state.players[0].team[1].hp);
        }

        expect(hp).toEqual([5, 10, 10]);
    });
});
