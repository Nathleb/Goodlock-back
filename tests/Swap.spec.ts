import { SlotIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer, canSwap, executeSwap, SwapDirection } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import EffectLabel from "@domain/types/EffectLabels.type";

const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage",     priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }] },
    { description: "Heal",       priority: 1, effects: [{ effect: EffectLabel.SingleTargetHeal,   magnitude: 5 }] },
    { description: "Shield",     priority: 1, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 5 }] },
    { description: "Swap left",  priority: 1, effects: [{ effect: EffectLabel.SwapLeft,           magnitude: 0 }] },
    { description: "Swap right", priority: 1, effects: [{ effect: EffectLabel.SwapRight,          magnitude: 0 }] },
    { description: "Damage2",    priority: 2, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }] },
];

initializeEffects();
const die = generateFullDie(baseDieInstructions);
const makeChar = (name: string) => createCharacter(name, 100, 5, die, { playerIndex: 0, slot: 0 });

const team1 = [makeChar("A"), makeChar("B"), makeChar("C"), makeChar("D"), makeChar("E")];
const team2 = [makeChar("V"), makeChar("W"), makeChar("X"), makeChar("Y"), makeChar("Z")];
const player1 = createPlayer(team1, 0);
const player2 = createPlayer(team2, 1);

describe('Swap', () => {
    describe('canSwap', () => {
        it('should allow left swap when not at leftmost slot', () => {
            expect(canSwap(player1, 2, SwapDirection.LEFT)).toBe(true);
        });

        it('should deny left swap at slot 0', () => {
            expect(canSwap(player1, 0, SwapDirection.LEFT)).toBe(false);
        });

        it('should allow right swap when not at rightmost slot', () => {
            expect(canSwap(player1, 2, SwapDirection.RIGHT)).toBe(true);
        });

        it('should deny right swap at last slot', () => {
            expect(canSwap(player1, 4, SwapDirection.RIGHT)).toBe(false);
        });
    });

    describe('executeSwap', () => {
        it('should exchange two adjacent characters positions', () => {
            const gameState = createGameState(player1, player2);
            const charA = gameState.players[0].team[0];
            const charB = gameState.players[0].team[1];

            const updated = executeSwap(gameState, charA.id, SwapDirection.RIGHT);

            expect(updated.players[0].team[0].id).toBe(charB.id);
            expect(updated.players[0].team[1].id).toBe(charA.id);
        });

        it('should update position.slot after swap', () => {
            const gameState = createGameState(player1, player2);
            const charA = gameState.players[0].team[0];

            const updated = executeSwap(gameState, charA.id, SwapDirection.RIGHT);

            expect(updated.players[0].team[1].position.slot).toBe(1);
            expect(updated.players[0].team[0].position.slot).toBe(0);
        });

        it('should not move a character at the boundary in the blocked direction', () => {
            const gameState = createGameState(player1, player2);
            const charA = gameState.players[0].team[0];

            const updated = executeSwap(gameState, charA.id, SwapDirection.LEFT);

            expect(updated.players[0].team[0].id).toBe(charA.id);
        });

        it('should only affect the player who owns the character', () => {
            const gameState = createGameState(player1, player2);
            const charA = gameState.players[0].team[0];
            const p2before = gameState.players[1].team.map(c => c.id);

            const updated = executeSwap(gameState, charA.id, SwapDirection.RIGHT);

            expect(updated.players[1].team.map(c => c.id)).toEqual(p2before);
        });

        it('should allow swapping with a dead character slot', () => {
            const gameState = createGameState(player1, player2);
            const charA = gameState.players[0].team[0];
            const deadB = { ...gameState.players[0].team[1], hp: 0 };
            const stateWithDead = {
                ...gameState,
                players: [
                    { ...gameState.players[0], team: [gameState.players[0].team[0], deadB, ...gameState.players[0].team.slice(2)] },
                    gameState.players[1],
                ] as [typeof player1, typeof player2],
            };

            const updated = executeSwap(stateWithDead, charA.id, SwapDirection.RIGHT);

            expect(updated.players[0].team[0].id).toBe(deadB.id);
            expect(updated.players[0].team[1].id).toBe(charA.id);
        });
    });
});

describe('SwapEffect (via priority queue)', () => {
    const withSwap = (gs: ReturnType<typeof createGameState>, face: ReturnType<typeof createGameState>['players'][0]['team'][0]['baseDie'][0], slot: SlotIndex, actorId: string, baseSpeed: number) =>
        ({ ...gs, priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(10), face, { playerIndex: 0 as const, slot }, actorId, baseSpeed) });

    it('SwapLeft effect moves the actor one slot to the left', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1]; // slot 1 — can swap left
        const { state } = unstackPriorityQueueWithLog(withSwap(gs, charB.baseDie[3], 1, charB.id, charB.baseSpeed));

        expect(state.players[0].team[0].id).toBe(charB.id);
        expect(state.players[0].team[1].id).toBe(gs.players[0].team[0].id);
    });

    it('SwapRight effect moves the actor one slot to the right', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0 — can swap right
        const { state } = unstackPriorityQueueWithLog(withSwap(gs, charA.baseDie[4], 0, charA.id, charA.baseSpeed));

        expect(state.players[0].team[1].id).toBe(charA.id);
        expect(state.players[0].team[0].id).toBe(gs.players[0].team[1].id);
    });

    it('SwapLeft has no effect at slot 0 (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const { state } = unstackPriorityQueueWithLog(withSwap(gs, charA.baseDie[3], 0, charA.id, charA.baseSpeed));

        expect(state.players[0].team[0].id).toBe(charA.id);
    });

    it('SwapRight has no effect at last slot (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charE = gs.players[0].team[4];
        const { state } = unstackPriorityQueueWithLog(withSwap(gs, charE.baseDie[4], 4, charE.id, charE.baseSpeed));

        expect(state.players[0].team[4].id).toBe(charE.id);
    });
});
