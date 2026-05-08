import EffectLabel from "@domain/types/EffectLabels.type";
import { SlotIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { loseHp } from "@domain/services/Character.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPriorityQueue, addEffectsToPriorityQueue, resetPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import GameState from "@domain/types/GameState.type";
import { Player } from "@domain/types/Player.type";

describe('PriorityQueueService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "Heals 2 HP",     priority: 1, effects: [{ effect: EffectLabel.SingleTargetHeal,   magnitude: 2 }] },
    { description: "Grants 3 shield",priority: 1, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 3 }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 4 }] },
    { description: "Heals 5 HP",     priority: 2, effects: [{ effect: EffectLabel.SingleTargetHeal,   magnitude: 5 }] },
    { description: "Grants 6 shield",priority: 2, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 6 }] },
  ];

  initializeEffects();
  const die = generateFullDie(baseDieInstructions);
  // baseSpeed: 0 so finalPriority = face.priority + 0 = face.priority
  const character = createCharacter("TestCharacter", 100, 0, die, { playerIndex: 0, slot: 0 });
  const target = { playerIndex: 1 as const, slot: 0 as SlotIndex };
  const player1: Player = { playerIndex: 0, team: [character] };
  const player2: Player = { playerIndex: 1, team: [character] };

  let gameState: GameState;
  beforeEach(() => {
    gameState = { ...createGameState(player1, player2), priorityQueue: createPriorityQueue(10) };
  });

  it('should create a priority queue', () => {
    expect(createPriorityQueue(15).length).toBe(15);
  });

  it('should add one entry per character at finalPriority = face.priority + baseSpeed', () => {
    const queue = addEffectsToPriorityQueue(gameState.priorityQueue, character.face, target, character.id, character.baseSpeed);
    expect(queue[1].length).toBe(1);
  });

  it('should reset priority queue', () => {
    const withEffect = { ...gameState, priorityQueue: addEffectsToPriorityQueue(gameState.priorityQueue, character.face, target, character.id, character.baseSpeed) };
    const reset = resetPriorityQueue(withEffect);
    expect(reset.priorityQueue.every(bucket => bucket.length === 0)).toBe(true);
  });

  it('should unstack priority queue and clear it', () => {
    const { state } = unstackPriorityQueueWithLog(gameState);
    expect(state.priorityQueue.every(bucket => bucket.length === 0)).toBe(true);
  });

  it('should cancel effects from dead actors and mark them skipped in the log', () => {
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

    const { state, log } = unstackPriorityQueueWithLog(stateWithDead);

    expect(state.players[1].team[0].hp).toBe(targetChar.hp);
    expect(log).toHaveLength(1);
    expect(log[0].skipped).toBe(true);
    expect(log[0].changes).toHaveLength(0);
  });

  it('killing blow appears in the log changes with hp 0', () => {
    const actor = createCharacter("Attacker", 100, 0,
      generateFullDie([
        { description: "Kill", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 100 }] },
        { description: "B", priority: 1, effects: [] },
        { description: "C", priority: 1, effects: [] },
        { description: "D", priority: 1, effects: [] },
        { description: "E", priority: 1, effects: [] },
        { description: "F", priority: 1, effects: [] },
      ]),
      { playerIndex: 0, slot: 0 }
    );
    const victim = createCharacter("Victim", 50, 0, die, { playerIndex: 1, slot: 0 });
    const stateWithQueue: GameState = {
      ...createGameState(
        { playerIndex: 0, team: [actor] },
        { playerIndex: 1, team: [victim] },
      ),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(10),
        actor.baseDie[0],
        { playerIndex: 1, slot: 0 },
        actor.id,
        actor.baseSpeed
      ),
    };

    const { log } = unstackPriorityQueueWithLog(stateWithQueue);

    expect(log).toHaveLength(1);
    expect(log[0].skipped).toBe(false);
    expect(log[0].changes).toHaveLength(1);
    expect(log[0].changes[0].characterId).toBe(victim.id);
    expect(log[0].changes[0].character.hp).toBe(0);
  });

  it('a face with multiple effects resolves atomically in one log step', () => {
    const multiDie = generateFullDie([
      { description: "Damage+Shield", priority: 1, effects: [
        { effect: EffectLabel.SingleTargetDamage, magnitude: 10 },
        { effect: EffectLabel.SingleTargetShield, magnitude: 5 },
      ]},
      { description: "B", priority: 1, effects: [] },
      { description: "C", priority: 1, effects: [] },
      { description: "D", priority: 1, effects: [] },
      { description: "E", priority: 1, effects: [] },
      { description: "F", priority: 1, effects: [] },
    ]);
    const actor = createCharacter("Actor", 100, 0, multiDie, { playerIndex: 0, slot: 0 });
    const targetChar = createCharacter("Target", 100, 0, die, { playerIndex: 1, slot: 0 });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor] }, { playerIndex: 1, team: [targetChar] }),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(10),
        actor.baseDie[0],
        { playerIndex: 1, slot: 0 },
        actor.id,
        actor.baseSpeed
      ),
    };

    const { log } = unstackPriorityQueueWithLog(stateWithQueue);

    expect(log).toHaveLength(1);
    expect(log[0].characterId).toBe(actor.id);
    expect(log[0].changes).toHaveLength(1);
    expect(log[0].changes[0].character.hp).toBe(90);
    expect(log[0].changes[0].character.shield).toBe(5);
  });
});
