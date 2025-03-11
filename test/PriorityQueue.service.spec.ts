import { createPriorityQueue, addEffectsToPriorityQueue, resetPriorityQueue, unstackPriorityQueue } from "../src/services/PriorityQueue.service";
import { createGameState } from "../src/services/GameInit.service";
import { Player } from "../src/types/Player.type";
import { createCharacter, generateFullDie } from "../src/services/CharacterGeneration.service";
import { BaseDieInstructions } from "../src/types/BaseDieInstructions.type";

describe('PriorityQueueService', () => {
  const baseDieInstructions: BaseDieInstructions = {
    "0": [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }],
    "1": [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }],
    "2": [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }],
    "3": [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }],
    "4": [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }],
    "5": [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }]
  };

  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter("TestCharacter", 100, die, { playerIndex: 0, characterIndex: 0 });
  const player1: Player = { playerIndex: 0, team: [character] };
  const player2: Player = { playerIndex: 1, team: [character] };
  const gameState = createGameState(player1, player2);

  it('should create a priority queue', () => {
    const priorityQueue = createPriorityQueue(10);
    expect(priorityQueue.length).toBe(10);
  });

  it('should add effects to priority queue', () => {
    addEffectsToPriorityQueue(gameState.priorityQueue, character.currentFace, character.currentTarget);
    expect(gameState.priorityQueue[1].length).toBeGreaterThan(0);
  });

  it('should reset priority queue', () => {
    resetPriorityQueue(gameState);
    expect(gameState.priorityQueue.every(queue => queue.length === 0)).toBe(true);
  });

  it('should unstack priority queue', () => {
    const updatedGameState = unstackPriorityQueue(gameState);
    expect(updatedGameState.currentRound).toBe(1);
  });
});
