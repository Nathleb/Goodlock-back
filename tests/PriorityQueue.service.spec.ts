import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPriorityQueue, addEffectsToPriorityQueue, resetPriorityQueue, unstackPriorityQueue } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";

describe('PriorityQueueService', () => {
  const baseDieInstructions: BaseDieInstructions = {
    "0": { description: "Deals 1 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }] },
    "1": { description: "Heals 2 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }] },
    "2": { description: "Grants 3 shield", effects: [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }] },
    "3": { description: "Deals 4 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }] },
    "4": { description: "Heals 5 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }] },
    "5": { description: "Grants 6 shield", effects: [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }] }
  };

  initializeEffects();
  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter("TestCharacter", 100, die, { playerIndex: 0, characterIndex: 0 });
  const player1: Player = { playerIndex: 0, team: [character] };
  const player2: Player = { playerIndex: 1, team: [character] };
  const gameState = createGameState(player1, player2);

  beforeEach(() => {
    gameState.priorityQueue = createPriorityQueue(10);
  })

  it('should create a priority queue', () => {
    const priorityQueue = createPriorityQueue(15);
    expect(priorityQueue.length).toBe(15);
  });

  it('should add effects to priority queue', () => {
    addEffectsToPriorityQueue(gameState.priorityQueue, character.face, character.target, character.id);
    expect(gameState.priorityQueue[1].length).toBeGreaterThan(0);
  });

  it('should reset priority queue', () => {
    addEffectsToPriorityQueue(gameState.priorityQueue, character.face, character.target, character.id);
    expect(gameState.priorityQueue[1].length).toBeGreaterThan(0);
    resetPriorityQueue(gameState);
    expect(gameState.priorityQueue.every(queue => queue.length === 0)).toBe(true);
  });

  it('should unstack priority queue', () => {
    const updatedGameState = unstackPriorityQueue(gameState);
    expect(updatedGameState.priorityQueue.every(queue => queue.length === 0)).toBe(true);
  });
});
