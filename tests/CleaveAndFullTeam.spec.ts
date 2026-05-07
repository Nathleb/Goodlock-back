import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueue } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import GameState from "@domain/types/GameState.type";
import Position, { SlotIndex } from "@domain/types/Position.type";
import DieFace from "@domain/types/DieFace.type";

initializeEffects();

const cleaveInstructions: BaseDieInstructions = [
    { description: "Cleave Damage",    priority: 1, effects: [{ effect: EffectLabel.CleaveDamage,    magnitude: 5 }] },
    { description: "Cleave Heal",      priority: 1, effects: [{ effect: EffectLabel.CleaveHeal,      magnitude: 5 }] },
    { description: "Cleave Shield",    priority: 1, effects: [{ effect: EffectLabel.CleaveShield,    magnitude: 5 }] },
    { description: "Full Team Damage", priority: 1, effects: [{ effect: EffectLabel.FullTeamDamage,  magnitude: 3 }] },
    { description: "Full Team Heal",   priority: 1, effects: [{ effect: EffectLabel.FullTeamHeal,    magnitude: 3 }] },
    { description: "Full Team Shield", priority: 1, effects: [{ effect: EffectLabel.FullTeamShield,  magnitude: 3 }] },
];

const die = generateFullDie(cleaveInstructions);
const makeChar = (name: string, playerIndex: 0 | 1, slot: SlotIndex) =>
    createCharacter(name, 100, 0, die, { playerIndex, slot });

function makeGameState() {
    const team1 = [0, 1, 2, 3, 4].map(i => makeChar(`A${i}`, 0, i as SlotIndex));
    const team2 = [0, 1, 2, 3, 4].map(i => makeChar(`B${i}`, 1, i as SlotIndex));
    return createGameState(createPlayer(team1, 0), createPlayer(team2, 1));
}

function withEffect(gs: GameState, face: DieFace, target: Position, actorId: string, baseSpeed: number): GameState {
    return { ...gs, priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(10), face, target, actorId, baseSpeed) };
}

describe('Cleave effects', () => {
    it('CleaveDamage hits the target slot and its neighbors', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const updated = unstackPriorityQueue(withEffect(gs, actor.baseDie[0], { playerIndex: 1, slot: 2 }, actor.id, actor.baseSpeed));

        expect(updated.players[1].team[1].hp).toBe(95);
        expect(updated.players[1].team[2].hp).toBe(95);
        expect(updated.players[1].team[3].hp).toBe(95);
        expect(updated.players[1].team[0].hp).toBe(100);
        expect(updated.players[1].team[4].hp).toBe(100);
    });

    it('CleaveDamage at edge slot hits 2 characters', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const updated = unstackPriorityQueue(withEffect(gs, actor.baseDie[0], { playerIndex: 1, slot: 0 }, actor.id, actor.baseSpeed));

        expect(updated.players[1].team[0].hp).toBe(95);
        expect(updated.players[1].team[1].hp).toBe(95);
        expect(updated.players[1].team[2].hp).toBe(100);
    });

    it('CleaveHeal heals the target slot and its neighbors', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 80 }));
        const base: GameState = { ...gs, players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] };
        const actor = base.players[0].team[0];
        const updated = unstackPriorityQueue(withEffect(base, actor.baseDie[1], { playerIndex: 0, slot: 2 }, actor.id, actor.baseSpeed));

        expect(updated.players[0].team[1].hp).toBe(85);
        expect(updated.players[0].team[2].hp).toBe(85);
        expect(updated.players[0].team[3].hp).toBe(85);
        expect(updated.players[0].team[0].hp).toBe(80);
        expect(updated.players[0].team[4].hp).toBe(80);
    });

    it('CleaveShield grants shield to target slot and its neighbors', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const updated = unstackPriorityQueue(withEffect(gs, actor.baseDie[2], { playerIndex: 0, slot: 2 }, actor.id, actor.baseSpeed));

        expect(updated.players[0].team[1].shield).toBe(5);
        expect(updated.players[0].team[2].shield).toBe(5);
        expect(updated.players[0].team[3].shield).toBe(5);
        expect(updated.players[0].team[0].shield).toBe(0);
        expect(updated.players[0].team[4].shield).toBe(0);
    });
});

describe('FullTeam effects', () => {
    it('FullTeamDamage hits all 5 characters on the target team', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const updated = unstackPriorityQueue(withEffect(gs, actor.baseDie[3], { playerIndex: 1, slot: 0 }, actor.id, actor.baseSpeed));

        updated.players[1].team.forEach(c => expect(c.hp).toBe(97));
        updated.players[0].team.forEach(c => expect(c.hp).toBe(100));
    });

    it('FullTeamHeal heals all 5 characters on the target team', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 90 }));
        const base: GameState = { ...gs, players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] };
        const actor = base.players[0].team[0];
        const updated = unstackPriorityQueue(withEffect(base, actor.baseDie[4], { playerIndex: 0, slot: 0 }, actor.id, actor.baseSpeed));

        updated.players[0].team.forEach(c => expect(c.hp).toBe(93));
        updated.players[1].team.forEach(c => expect(c.hp).toBe(100));
    });

    it('FullTeamShield grants shield to all 5 characters on the target team', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const updated = unstackPriorityQueue(withEffect(gs, actor.baseDie[5], { playerIndex: 0, slot: 0 }, actor.id, actor.baseSpeed));

        updated.players[0].team.forEach(c => expect(c.shield).toBe(3));
        updated.players[1].team.forEach(c => expect(c.shield).toBe(0));
    });
});
