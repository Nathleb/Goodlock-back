import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueue } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

initializeEffects();

const cleaveInstructions: BaseDieInstructions = [
    { description: "Cleave Damage", priority: 1, effects: [{ effect: "CleaveDamage", magnitude: 5 }] },
    { description: "Cleave Heal", priority: 1, effects: [{ effect: "CleaveHeal", magnitude: 5 }] },
    { description: "Cleave Shield", priority: 1, effects: [{ effect: "CleaveShield", magnitude: 5 }] },
    { description: "Full Team Damage", priority: 1, effects: [{ effect: "FullTeamDamage", magnitude: 3 }] },
    { description: "Full Team Heal", priority: 1, effects: [{ effect: "FullTeamHeal", magnitude: 3 }] },
    { description: "Full Team Shield", priority: 1, effects: [{ effect: "FullTeamShield", magnitude: 3 }] },
];

const die = generateFullDie(cleaveInstructions);
const makeChar = (name: string, playerIndex: 0 | 1, slot: number) =>
    createCharacter(name, 100, 0, die, { playerIndex, slot });

function makeGameState() {
    const team1 = [0, 1, 2, 3, 4].map(i => makeChar(`A${i}`, 0, i));
    const team2 = [0, 1, 2, 3, 4].map(i => makeChar(`B${i}`, 1, i));
    return createGameState(createPlayer(team1, 0), createPlayer(team2, 1));
}

describe('Cleave effects', () => {
    it('CleaveDamage hits the target slot and its neighbors', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        // target slot 2 on opponent → hits slots 1, 2, 3
        const target = { playerIndex: 1 as const, slot: 2 };
        gs.priorityQueue = createPriorityQueue(10);
        addEffectsToPriorityQueue(gs.priorityQueue, actor.baseDie[0], target, actor.id, actor.baseSpeed);

        const updated = unstackPriorityQueue(gs);

        expect(updated.players[1].team[1].hp).toBe(95); // hit
        expect(updated.players[1].team[2].hp).toBe(95); // hit
        expect(updated.players[1].team[3].hp).toBe(95); // hit
        expect(updated.players[1].team[0].hp).toBe(100); // not hit
        expect(updated.players[1].team[4].hp).toBe(100); // not hit
    });

    it('CleaveDamage at edge slot hits 2 characters', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const target = { playerIndex: 1 as const, slot: 0 };
        gs.priorityQueue = createPriorityQueue(10);
        addEffectsToPriorityQueue(gs.priorityQueue, actor.baseDie[0], target, actor.id, actor.baseSpeed);

        const updated = unstackPriorityQueue(gs);

        expect(updated.players[1].team[0].hp).toBe(95);
        expect(updated.players[1].team[1].hp).toBe(95);
        expect(updated.players[1].team[2].hp).toBe(100);
    });

    it('CleaveHeal heals the target slot and its neighbors', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 80 }));
        const stateWithDamage = {
            ...gs,
            players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] as typeof gs.players,
        };
        const actor = stateWithDamage.players[0].team[0];
        const target = { playerIndex: 0 as const, slot: 2 };
        stateWithDamage.priorityQueue = createPriorityQueue(10);
        addEffectsToPriorityQueue(stateWithDamage.priorityQueue, actor.baseDie[1], target, actor.id, actor.baseSpeed);

        const updated = unstackPriorityQueue(stateWithDamage);

        expect(updated.players[0].team[1].hp).toBe(85);
        expect(updated.players[0].team[2].hp).toBe(85);
        expect(updated.players[0].team[3].hp).toBe(85);
        expect(updated.players[0].team[0].hp).toBe(80);
        expect(updated.players[0].team[4].hp).toBe(80);
    });

    it('CleaveShield grants shield to target slot and its neighbors', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const target = { playerIndex: 0 as const, slot: 2 };
        gs.priorityQueue = createPriorityQueue(10);
        addEffectsToPriorityQueue(gs.priorityQueue, actor.baseDie[2], target, actor.id, actor.baseSpeed);

        const updated = unstackPriorityQueue(gs);

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
        const target = { playerIndex: 1 as const, slot: 0 };
        gs.priorityQueue = createPriorityQueue(10);
        addEffectsToPriorityQueue(gs.priorityQueue, actor.baseDie[3], target, actor.id, actor.baseSpeed);

        const updated = unstackPriorityQueue(gs);

        updated.players[1].team.forEach(c => expect(c.hp).toBe(97));
        updated.players[0].team.forEach(c => expect(c.hp).toBe(100));
    });

    it('FullTeamHeal heals all 5 characters on the target team', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 90 }));
        const stateWithDamage = {
            ...gs,
            players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] as typeof gs.players,
        };
        const actor = stateWithDamage.players[0].team[0];
        const target = { playerIndex: 0 as const, slot: 0 };
        stateWithDamage.priorityQueue = createPriorityQueue(10);
        addEffectsToPriorityQueue(stateWithDamage.priorityQueue, actor.baseDie[4], target, actor.id, actor.baseSpeed);

        const updated = unstackPriorityQueue(stateWithDamage);

        updated.players[0].team.forEach(c => expect(c.hp).toBe(93));
        updated.players[1].team.forEach(c => expect(c.hp).toBe(100));
    });

    it('FullTeamShield grants shield to all 5 characters on the target team', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0];
        const target = { playerIndex: 0 as const, slot: 0 };
        gs.priorityQueue = createPriorityQueue(10);
        addEffectsToPriorityQueue(gs.priorityQueue, actor.baseDie[5], target, actor.id, actor.baseSpeed);

        const updated = unstackPriorityQueue(gs);

        updated.players[0].team.forEach(c => expect(c.shield).toBe(3));
        updated.players[1].team.forEach(c => expect(c.shield).toBe(0));
    });
});
