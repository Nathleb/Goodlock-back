import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { loseHp } from "@domain/services/Character.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPriorityQueue, addEffectsToPriorityQueue, resetPriorityQueue, unstackPriorityQueue } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import GameState from "@domain/types/GameState.type";
import { Player } from "@domain/types/Player.type";

describe('PriorityQueueService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: "SingleTargetDamage", magnitude: 1 }] },
    { description: "Heals 2 HP",     priority: 1, effects: [{ effect: "SingleTargetHeal",   magnitude: 2 }] },
    { description: "Grants 3 shield",priority: 1, effects: [{ effect: "SingleTargetShield", magnitude: 3 }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: "SingleTargetDamage", magnitude: 4 }] },
    { description: "Heals 5 HP",     priority: 2, effects: [{ effect: "SingleTargetHeal",   magnitude: 5 }] },
    { description: "Grants 6 shield",priority: 2, effects: [{ effect: "SingleTargetShield", magnitude: 6 }] },
  ];

  initializeEffects();
  const die = generateFullDie(baseDieInstructions);
  // baseSpeed: 0 so finalPriority = face.priority + 0 = face.priority
  const character = createCharacter("TestCharacter", 100, 0, die, { playerIndex: 0, slot: 0 });
  const target = { playerIndex: 1 as const, slot: 0 };
  const player1: Player = { playerIndex: 0, team: [character] };
  const player2: Player = { playerIndex: 1, team: [character] };

  let gameState: GameState;
  beforeEach(() => {
    gameState = { ...createGameState(player1, player2), priorityQueue: createPriorityQueue(10) };
  });

  it('should create a priority queue', () => {
    expect(createPriorityQueue(15).length).toBe(15);
  });

  it('should add effects at finalPriority = face.priority + baseSpeed', () => {
    // face[0].priority = 1, baseSpeed = 0, finalPriority = 1
    const queue = addEffectsToPriorityQueue(gameState.priorityQueue, character.face, target, character.id, character.baseSpeed);
    expect(queue[1].length).toBeGreaterThan(0);
  });

  it('should reset priority queue', () => {
    const withEffect = { ...gameState, priorityQueue: addEffectsToPriorityQueue(gameState.priorityQueue, character.face, target, character.id, character.baseSpeed) };
    const reset = resetPriorityQueue(withEffect);
    expect(reset.priorityQueue.every(bucket => bucket.length === 0)).toBe(true);
  });

  it('should unstack priority queue', () => {
    const updated = unstackPriorityQueue(gameState);
    expect(updated.priorityQueue.every(bucket => bucket.length === 0)).toBe(true);
  });

  it('should cancel effects from dead actors', () => {
    const actor = createCharacter("Actor", 100, 0, die, { playerIndex: 0, slot: 0 });
    const targetChar = createCharacter("Target", 100, 0, die, { playerIndex: 1, slot: 0 });
    const deadActor = loseHp(actor, 100);
    const stateWithDead: GameState = {
      ...gameState,
      players: [
        { playerIndex: 0, team: [deadActor] },
        { playerIndex: 1, team: [targetChar] },
      ],
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(10),
        actor.face,
        { playerIndex: 1, slot: 0 },
        deadActor.id,
        deadActor.baseSpeed
      ),
    };

    const updated = unstackPriorityQueue(stateWithDead);

    expect(updated.players[1].team[0].hp).toBe(targetChar.hp);
  });
});
