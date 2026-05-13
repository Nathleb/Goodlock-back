import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import GameState from "@domain/types/GameState.type";
import Position, { SlotIndex } from "@domain/types/Position.type";
import DieFace from "@domain/types/DieFace.type";

initializeEffects();

// Face index reference:
// [0] SelfDamage:3
// [1] SelfHeal:5
// [2] SelfShield:2
// [3] SingleTargetDamage:4 + SelfShield:2
// [4] SingleTargetDamage:5 + SelfHeal:3
// [5] SelfDamage:2 + SingleTargetDamage:6
const selfDieInstructions: BaseDieInstructions = [
    { description: "SelfDamage:3",           priority: 1, effects: [{ effect: EffectLabel.SelfDamage, magnitude: 3 }] },
    { description: "SelfHeal:5",             priority: 1, effects: [{ effect: EffectLabel.SelfHeal,   magnitude: 5 }] },
    { description: "SelfShield:2",           priority: 1, effects: [{ effect: EffectLabel.SelfShield, magnitude: 2 }] },
    { description: "STDamage:4+SelfShield:2",priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 4 }, { effect: EffectLabel.SelfShield, magnitude: 2 }] },
    { description: "STDamage:5+SelfHeal:3",  priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }, { effect: EffectLabel.SelfHeal,   magnitude: 3 }] },
    { description: "SelfDmg:2+STDamage:6",  priority: 1, effects: [{ effect: EffectLabel.SelfDamage,  magnitude: 2 }, { effect: EffectLabel.SingleTargetDamage, magnitude: 6 }] },
];

const die = generateFullDie(selfDieInstructions);
const makeChar = (name: string, playerIndex: 0 | 1, slot: SlotIndex) =>
    createCharacter(name, 20, 0, die, { playerIndex, slot });

function makeGameState() {
    const team1 = [0, 1, 2, 3, 4].map(i => makeChar(`A${i}`, 0, i as SlotIndex));
    const team2 = [0, 1, 2, 3, 4].map(i => makeChar(`B${i}`, 1, i as SlotIndex));
    return createGameState(createPlayer(team1, 0), createPlayer(team2, 1));
}

function withEffect(gs: GameState, face: DieFace, target: Position, actorId: string, baseSpeed: number): GameState {
    return { ...gs, priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(10), face, target, actorId, baseSpeed) };
}

describe('SelfDamage', () => {
    it('damages the actor, not the target', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0]; // A0, slot 0
        const target: Position = { playerIndex: 1, slot: 2 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[0], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[0].hp).toBe(17); // 20 - 3
        expect(updated.players[1].team[2].hp).toBe(20); // target unchanged
    });
});

describe('SelfHeal', () => {
    it('heals the actor, not the target', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 10 }));
        const base: GameState = { ...gs, players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] };
        const actor = base.players[0].team[1]; // A1, slot 1
        const target: Position = { playerIndex: 1, slot: 2 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(base, actor.baseDie[1], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[1].hp).toBe(15); // 10 + 5
        expect(updated.players[1].team[2].hp).toBe(20); // target unchanged
    });

    it('does not overheal beyond maxHp', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[1]; // already at maxHp (20)
        const target: Position = { playerIndex: 1, slot: 0 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[1], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[1].hp).toBe(20); // capped at maxHp
    });
});

describe('SelfShield', () => {
    it('grants shield to the actor, not the target', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[2]; // A2, slot 2
        const target: Position = { playerIndex: 1, slot: 0 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[2], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[2].shield).toBe(2);
        expect(updated.players[1].team[0].shield).toBe(0); // target unchanged
    });
});

describe('Combo faces', () => {
    it('SingleTargetDamage + SelfShield: damages target and shields actor', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0]; // A0
        const target: Position = { playerIndex: 1, slot: 1 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[3], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[1].team[1].hp).toBe(16);    // 20 - 4
        expect(updated.players[0].team[0].shield).toBe(2); // actor gains shield
    });

    it('SingleTargetDamage + SelfHeal: damages target and heals actor', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 10 }));
        const base: GameState = { ...gs, players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] };
        const actor = base.players[0].team[0]; // A0
        const target: Position = { playerIndex: 1, slot: 0 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(base, actor.baseDie[4], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[1].team[0].hp).toBe(15); // 20 - 5
        expect(updated.players[0].team[0].hp).toBe(13); // 10 + 3
    });

    it('SelfDamage + SingleTargetDamage: actor takes damage and deals damage to target', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0]; // A0
        const target: Position = { playerIndex: 1, slot: 3 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[5], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[0].hp).toBe(18); // 20 - 2 (self)
        expect(updated.players[1].team[3].hp).toBe(14); // 20 - 6 (target)
    });
});
