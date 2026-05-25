import { SlotIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import EffectLabel from "@domain/types/EffectLabels.type";
import GameState from "@domain/types/GameState.type";
import { PlayerIndex } from "@domain/types/Position.type";

const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage",      priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }] },
    { description: "SwapAlly",    priority: 1, effects: [{ effect: EffectLabel.SwapAlly,           magnitude: 0 }] },
    { description: "PushLeft1",   priority: 1, effects: [{ effect: EffectLabel.PushLeft,            magnitude: 1 }] },
    { description: "PushRight1",  priority: 1, effects: [{ effect: EffectLabel.PushRight,           magnitude: 1 }] },
    { description: "MoveToSlot2", priority: 1, effects: [{ effect: EffectLabel.MoveToSlot,          magnitude: 2 }] },
    { description: "PushLeft2",   priority: 2, effects: [{ effect: EffectLabel.PushLeft,            magnitude: 2 }] },
];

initializeEffects();
const die = generateFullDie(baseDieInstructions);
const makeChar = (name: string) => createCharacter(name, 100, 5, die, { playerIndex: 0, slot: 0 });

const team1 = [makeChar("A"), makeChar("B"), makeChar("C"), makeChar("D"), makeChar("E")];
const team2 = [makeChar("V"), makeChar("W"), makeChar("X"), makeChar("Y"), makeChar("Z")];
const player1 = createPlayer(team1, 0);
const player2 = createPlayer(team2, 1);

function resolve(
    gs: GameState,
    actorId: string,
    faceIndex: number,
    targetPlayerIndex: PlayerIndex,
    targetSlot: SlotIndex,
): GameState {
    const actor = gs.players.flatMap(p => p.team).find(c => c.id === actorId)!;
    const state = {
        ...gs,
        priorityQueue: addEffectsToPriorityQueue(
            createPriorityQueue(10),
            actor.baseDie[faceIndex],
            { playerIndex: targetPlayerIndex, slot: targetSlot },
            actorId,
            actor.baseSpeed,
        ),
    };
    return unstackPriorityQueueWithLog(state).state;
}

describe('SwapAlly', () => {
    it('swaps actor with targeted ally', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charB = gs.players[0].team[1]; // slot 1

        const result = resolve(gs, charB.id, 1, 0, 0); // charB targets slot 0 (charA)

        expect(result.players[0].team[0].id).toBe(charB.id);
        expect(result.players[0].team[1].id).toBe(charA.id);
    });

    it('preserves position.slot after swap', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1];

        const result = resolve(gs, charB.id, 1, 0, 0);

        expect(result.players[0].team[0].position.slot).toBe(0);
        expect(result.players[0].team[1].position.slot).toBe(1);
    });

    it('is a no-op when actor targets an opponent slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 1, 1, 0); // targets opponent team

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('is a no-op when actor targets their own slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 1, 0, 0); // self-target

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('does not affect the opponent team', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1];
        const before = gs.players[1].team.map(c => c.id);

        const result = resolve(gs, charB.id, 1, 0, 0);

        expect(result.players[1].team.map(c => c.id)).toEqual(before);
    });
});

describe('Push', () => {
    it('PushLeft moves target one slot to the left', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1]; // slot 1
        const charA = gs.players[0].team[0]; // slot 0

        const result = resolve(gs, charB.id, 2, 0, 1); // push charB (slot 1) left

        expect(result.players[0].team[0].id).toBe(charB.id);
        expect(result.players[0].team[1].id).toBe(charA.id);
    });

    it('PushRight moves target one slot to the right', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charB = gs.players[0].team[1]; // slot 1

        const result = resolve(gs, charA.id, 3, 0, 0); // push charA (slot 0) right

        expect(result.players[0].team[1].id).toBe(charA.id);
        expect(result.players[0].team[0].id).toBe(charB.id);
    });

    it('PushLeft is a no-op at slot 0 (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 2, 0, 0); // push slot 0 left

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('PushRight is a no-op at last slot (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charE = gs.players[0].team[4];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charE.id, 3, 0, 4); // push slot 4 right

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('PushLeft with magnitude 2 moves target two slots left', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2]; // slot 2
        const charA = gs.players[0].team[0]; // slot 0

        const result = resolve(gs, charC.id, 5, 0, 2); // face 5: PushLeft magnitude 2

        expect(result.players[0].team[0].id).toBe(charC.id);
        expect(result.players[0].team[2].id).toBe(charA.id);
    });

    it('PushLeft magnitude 2 is a no-op when it would exceed boundary', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0 — push by 2 would land at -2
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 5, 0, 0);

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push can target an enemy and moves them within their own team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const enemyB = gs.players[1].team[1]; // slot 1 on opponent team
        const enemyA = gs.players[1].team[0]; // slot 0

        const result = resolve(gs, charA.id, 2, 1, 1); // push enemy slot 1 left

        expect(result.players[1].team[0].id).toBe(enemyB.id);
        expect(result.players[1].team[1].id).toBe(enemyA.id);
    });
});

describe('MoveToSlot', () => {
    it('moves targeted character to the fixed destination slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0 — will be moved to slot 2
        const charC = gs.players[0].team[2]; // slot 2 — will be displaced to slot 0

        const result = resolve(gs, charA.id, 4, 0, 0); // face 4: MoveToSlot magnitude 2, target slot 0

        expect(result.players[0].team[2].id).toBe(charA.id);
        expect(result.players[0].team[0].id).toBe(charC.id);
    });

    it('is a no-op when target is already at the destination slot', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charC.id, 4, 0, 2); // target at slot 2, destination is slot 2

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('can move an enemy to the fixed destination slot within their team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const enemyA = gs.players[1].team[0]; // slot 0 — moved to slot 2
        const enemyC = gs.players[1].team[2]; // slot 2 — displaced

        const result = resolve(gs, charA.id, 4, 1, 0); // target enemy slot 0, move to slot 2

        expect(result.players[1].team[2].id).toBe(enemyA.id);
        expect(result.players[1].team[0].id).toBe(enemyC.id);
    });
});
