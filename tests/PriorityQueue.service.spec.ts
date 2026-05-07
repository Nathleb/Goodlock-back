import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { loseHp } from "@domain/services/Character.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPriorityQueue, addEffectsToPriorityQueue, resetPriorityQueue, unstackPriorityQueue } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";

describe('PriorityQueueService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: "SingleTargetDamage", magnitude: 1 }] },
    { description: "Heals 2 HP", priority: 1, effects: [{ effect: "SingleTargetHeal", magnitude: 2 }] },
    { description: "Grants 3 shield", priority: 1, effects: [{ effect: "SingleTargetShield", magnitude: 3 }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: "SingleTargetDamage", magnitude: 4 }] },
    { description: "Heals 5 HP", priority: 2, effects: [{ effect: "SingleTargetHeal", magnitude: 5 }] },
    { description: "Grants 6 shield", priority: 2, effects: [{ effect: "SingleTargetShield", magnitude: 6 }] },
  ];

  initializeEffects();
  const die = generateFullDie(baseDieInstructions);
  // baseSpeed: 0 so finalPriority = face.priority + 0 = face.priority
  const character = createCharacter("TestCharacter", 100, 0, die, { playerIndex: 0, slot: 0 });
  const target = { playerIndex: 1 as const, slot: 0 };
  const player1: Player = { playerIndex: 0, team: [character] };
  const player2: Player = { playerIndex: 1, team: [character] };
  const gameState = createGameState(player1, player2);

  beforeEach(() => {
    gameState.priorityQueue = createPriorityQueue(10);
  });

  it('should create a priority queue', () => {
    const priorityQueue = createPriorityQueue(15);
    expect(priorityQueue.length).toBe(15);
  });

  it('should add effects at finalPriority = face.priority + baseSpeed', () => {
    addEffectsToPriorityQueue(gameState.priorityQueue, character.face, target, character.id, character.baseSpeed);
    // face[0].priority = 1, baseSpeed = 0, finalPriority = 1
    expect(gameState.priorityQueue[1].length).toBeGreaterThan(0);
  });

  it('should reset priority queue', () => {
    addEffectsToPriorityQueue(gameState.priorityQueue, character.face, target, character.id, character.baseSpeed);
    resetPriorityQueue(gameState);
    expect(gameState.priorityQueue.every(queue => queue.length === 0)).toBe(true);
  });

  it('should unstack priority queue', () => {
    const updatedGameState = unstackPriorityQueue(gameState);
    expect(updatedGameState.priorityQueue.every(queue => queue.length === 0)).toBe(true);
  });

  it('should cancel effects from dead actors', () => {
    // Use distinct instances so their IDs are different
    const actor = createCharacter("Actor", 100, 0, die, { playerIndex: 0, slot: 0 });
    const targetChar = createCharacter("Target", 100, 0, die, { playerIndex: 1, slot: 0 });
    const deadActor = loseHp(actor, 100);
    const stateWithDead = {
      ...gameState,
      players: [
        { playerIndex: 0 as const, team: [deadActor] },
        { playerIndex: 1 as const, team: [targetChar] },
      ] as [Player, Player],
      priorityQueue: createPriorityQueue(10),
    };
    addEffectsToPriorityQueue(stateWithDead.priorityQueue, actor.face, { playerIndex: 1 as const, slot: 0 }, deadActor.id, deadActor.baseSpeed);

    const updated = unstackPriorityQueue(stateWithDead);

    // effect should have been skipped — target HP unchanged
    expect(updated.players[1].team[0].hp).toBe(targetChar.hp);
  });
});
