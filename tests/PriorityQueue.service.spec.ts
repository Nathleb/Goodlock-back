import EffectLabel from "@domain/types/EffectLabels.type";
import { SlotIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { loseHp } from "@domain/services/Character.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPriorityQueue, addEffectsToPriorityQueue, resetPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { createPlayer } from "@domain/services/Player.service";
import { beginResolvePhase } from "@domain/services/Phase.service";
import TargetConstraint from "@domain/types/TargetConstraint.type";
import DieFace from "@domain/types/DieFace.type";
import Position from "@domain/types/Position.type";
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

  it('a face with no effects produces an empty-changes step (not skipped)', () => {
    const noOpDie = generateFullDie([
      { description: "No-op", priority: 1, effects: [] },
      { description: "B", priority: 1, effects: [] },
      { description: "C", priority: 1, effects: [] },
      { description: "D", priority: 1, effects: [] },
      { description: "E", priority: 1, effects: [] },
      { description: "F", priority: 1, effects: [] },
    ]);
    const actor = createCharacter("Actor", 100, 0, noOpDie, { playerIndex: 0, slot: 0 });
    const targetChar = createCharacter("Target", 100, 0, die, { playerIndex: 1, slot: 0 });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor] }, { playerIndex: 1, team: [targetChar] }),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(10),
        actor.baseDie[0],
        { playerIndex: 1, slot: 0 as SlotIndex },
        actor.id,
        actor.baseSpeed
      ),
    };

    const { log } = unstackPriorityQueueWithLog(stateWithQueue);

    expect(log).toHaveLength(1);
    expect(log[0].characterId).toBe(actor.id);
    expect(log[0].skipped).toBe(false);
    expect(log[0].changes).toHaveLength(0);
  });

  it('a boundary PushLeft at slot 0 produces an empty-changes step (not skipped)', () => {
    const swapDie = generateFullDie([
      { description: "A",        priority: 1, effects: [] },
      { description: "B",        priority: 1, effects: [] },
      { description: "C",        priority: 1, effects: [] },
      { description: "PushLeft", priority: 1, effects: [{ effect: EffectLabel.PushLeft, magnitude: 1 }] },
      { description: "E",        priority: 1, effects: [] },
      { description: "F",        priority: 1, effects: [] },
    ]);
    const actor = createCharacter("Swapper", 100, 0, swapDie, { playerIndex: 0, slot: 0 });
    const targetChar = createCharacter("Target", 100, 0, die, { playerIndex: 1, slot: 0 });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor] }, { playerIndex: 1, team: [targetChar] }),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(10),
        actor.baseDie[3], // PushLeft face
        { playerIndex: 0, slot: 0 as SlotIndex },
        actor.id,
        actor.baseSpeed
      ),
    };

    const { log } = unstackPriorityQueueWithLog(stateWithQueue);

    expect(log).toHaveLength(1);
    expect(log[0].characterId).toBe(actor.id);
    expect(log[0].skipped).toBe(false);
    expect(log[0].changes).toHaveLength(0);
  });

  it('two actors in the same priority bucket each produce a log step', () => {
    const actor1 = createCharacter("Actor1", 100, 0, die, { playerIndex: 0, slot: 0 });
    const actor2 = createCharacter("Actor2", 100, 0, die, { playerIndex: 1, slot: 0 });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor1] }, { playerIndex: 1, team: [actor2] }),
      priorityQueue: addEffectsToPriorityQueue(
        addEffectsToPriorityQueue(
          createPriorityQueue(10),
          actor1.baseDie[0], // priority 1
          { playerIndex: 1, slot: 0 as SlotIndex },
          actor1.id,
          actor1.baseSpeed
        ),
        actor2.baseDie[0], // priority 1 — same bucket
        { playerIndex: 0, slot: 0 as SlotIndex },
        actor2.id,
        actor2.baseSpeed
      ),
    };

    const { log } = unstackPriorityQueueWithLog(stateWithQueue);

    expect(log).toHaveLength(2);
    expect(log.map(s => s.characterId)).toEqual(expect.arrayContaining([actor1.id, actor2.id]));
    expect(log.every(s => !s.skipped)).toBe(true);
  });

  it('throws when a queued face has a violated targetConstraint', () => {
    initializeEffects();
    const face: DieFace = {
        priority: 1,
        effects: [],
        description: 'ally-only',
        targetConstraint: TargetConstraint.ALLY_ONLY,
    };
    const makeFaceChar = (name: string, pi: number, slot: number) =>
        createCharacter(name, 100, 5, [face, face, face, face, face, face], { playerIndex: pi as 0 | 1, slot: slot as SlotIndex });

    const team1 = [0, 1, 2, 3, 4].map(i => makeFaceChar(`T${i}`, 0, i));
    const team2 = [0, 1, 2, 3, 4].map(i => makeFaceChar(`E${i}`, 1, i));
    const player1 = createPlayer(team1, 0);
    const player2 = createPlayer(team2, 1);
    let gs = createGameState(player1, player2);
    gs = beginResolvePhase(gs);

    // Manually inject a bad entry: ALLY_ONLY face targeting enemy team
    const enemyPos: Position = { playerIndex: 1, slot: 0 as SlotIndex };
    let queue = createPriorityQueue(10);
    queue = addEffectsToPriorityQueue(queue, face, enemyPos, team1[0].id, team1[0].baseSpeed);
    gs = { ...gs, priorityQueue: queue };

    expect(() => unstackPriorityQueueWithLog(gs)).toThrow('ALLY_ONLY');
  });

  it('skips entry if character is not found in any team', () => {
    initializeEffects();
    const face: DieFace = {
        priority: 1,
        effects: [],
        description: 'test',
        targetConstraint: TargetConstraint.ANY,
    };

    const team1 = [0, 1, 2, 3, 4].map(i =>
        createCharacter(`T${i}`, 100, 5, [face, face, face, face, face, face], { playerIndex: 0 as 0 | 1, slot: i as SlotIndex })
    );
    const team2 = [0, 1, 2, 3, 4].map(i =>
        createCharacter(`E${i}`, 100, 5, [face, face, face, face, face, face], { playerIndex: 1 as 0 | 1, slot: i as SlotIndex })
    );
    const player1 = createPlayer(team1, 0);
    const player2 = createPlayer(team2, 1);
    let gs = createGameState(player1, player2);
    gs = beginResolvePhase(gs);

    // Inject entry with non-existent character ID
    let queue = createPriorityQueue(10);
    queue = addEffectsToPriorityQueue(queue, face, { playerIndex: 1, slot: 0 as SlotIndex }, 'NON_EXISTENT_ID', 1);
    gs = { ...gs, priorityQueue: queue };

    const { log } = unstackPriorityQueueWithLog(gs);

    expect(log).toHaveLength(1);
    expect(log[0].characterId).toBe('NON_EXISTENT_ID');
    expect(log[0].skipped).toBe(true);
  });

  it('an actor killed during resolution by a higher-priority action is marked skipped', () => {
    // killer uses face[3] (priority 2, damage 4) — resolves first
    // victim uses face[0] (priority 1, damage 1) — but is dead by then
    const killer = createCharacter("Killer", 100, 0, die, { playerIndex: 0, slot: 0 });
    const victim = createCharacter("Victim", 1, 0, die, { playerIndex: 1, slot: 0 });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [killer] }, { playerIndex: 1, team: [victim] }),
      priorityQueue: addEffectsToPriorityQueue(
        addEffectsToPriorityQueue(
          createPriorityQueue(10),
          killer.baseDie[3], // priority 2, damage 4 → kills victim (hp 1)
          { playerIndex: 1, slot: 0 as SlotIndex },
          killer.id,
          killer.baseSpeed
        ),
        victim.baseDie[0], // priority 1 — victim already dead
        { playerIndex: 0, slot: 0 as SlotIndex },
        victim.id,
        victim.baseSpeed
      ),
    };

    const { log } = unstackPriorityQueueWithLog(stateWithQueue);

    expect(log).toHaveLength(2);
    const killerStep = log.find(s => s.characterId === killer.id)!;
    const victimStep = log.find(s => s.characterId === victim.id)!;
    expect(killerStep.skipped).toBe(false);
    expect(killerStep.changes[0].character.hp).toBe(0);
    expect(victimStep.skipped).toBe(true);
    expect(victimStep.changes).toHaveLength(0);
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
