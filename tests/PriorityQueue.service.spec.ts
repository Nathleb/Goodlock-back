import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { loseHp } from "@domain/services/Character.service";
import { createGameState, buildEffectFactory } from "@domain/services/GameInit.service";
import { createPriorityQueue, addEffectsToPriorityQueue, addAllEffectsToPriorityQueue, resetPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { createPlayer } from "@domain/services/Player.service";
import { endOfRound } from "@domain/services/Round.service";
import { beginResolvePhase } from "@domain/services/Phase.service";
import DieFace from "@domain/types/DieFace.type";
import { BaseDieInstructions, EffectEntry } from "@domain/types/BaseDieInstructions.type";
import GameState from "@domain/types/GameState.type";
import { Player } from "@domain/types/Player.type";
import { enemyAbs, enemyRel, allyRel, allyAbs } from "./helpers/targets";

describe('PriorityQueueService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyAbs(0)] }] },
    { description: "Heals 2 HP",     priority: 1, effects: [{ effect: EffectLabel.Heal, magnitude: 2, targets: [enemyAbs(0)] }] },
    { description: "Grants 3 shield",priority: 1, effects: [{ effect: EffectLabel.Shield, magnitude: 3, targets: [enemyAbs(0)] }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: EffectLabel.Damage, magnitude: 4, targets: [enemyAbs(0)] }] },
    { description: "Heals 5 HP",     priority: 2, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [enemyAbs(0)] }] },
    { description: "Grants 6 shield",priority: 2, effects: [{ effect: EffectLabel.Shield, magnitude: 6, targets: [enemyAbs(0)] }] },
  ];

  const factory = buildEffectFactory();
  const die = generateFullDie(baseDieInstructions, factory);
  // baseSpeed: 0 so finalPriority = face.priority + 0 = face.priority
  const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: "TestCharacter", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 0, slot: 0 } });
  const player1: Player = { playerIndex: 0, team: [character] };
  const player2: Player = { playerIndex: 1, team: [character] };

  let gameState: GameState;
  beforeEach(() => {
    gameState = { ...createGameState(player1, player2), priorityQueue: createPriorityQueue() };
  });

  it('creates an empty priority queue', () => {
    expect(createPriorityQueue()).toEqual([]);
  });

  it('appends one flat entry per queued action', () => {
    const queue = addEffectsToPriorityQueue(createPriorityQueue(), character.face, character.id, character.baseSpeed);
    expect(queue.length).toBe(1);
  });

  it('resets the priority queue to empty', () => {
    const withEffect = { ...gameState, priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(), character.face, character.id, character.baseSpeed) };
    const reset = resetPriorityQueue(withEffect);
    expect(reset.priorityQueue.length).toBe(0);
  });

  it('unstacks the priority queue and clears it', () => {
    const { state } = unstackPriorityQueueWithLog(gameState);
    expect(state.priorityQueue.length).toBe(0);
  });

  it('should cancel effects from dead actors and mark them skipped in the log', () => {
    const actor = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Actor", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 0, slot: 0 } });
    const targetChar = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Target", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 } });
    const deadActor = loseHp(actor, 100);
    const stateWithDead: GameState = {
      ...gameState,
      players: [
        { playerIndex: 0, team: [deadActor] },
        { playerIndex: 1, team: [targetChar] },
      ],
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(),
        actor.face,
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
    const actor = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Attacker", maxHp: 100, baseSpeed: 0, baseDie: generateFullDie([
        { description: "Kill", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 100, targets: [enemyAbs(0)] }] },
        { description: "B", priority: 1, effects: [] },
        { description: "C", priority: 1, effects: [] },
        { description: "D", priority: 1, effects: [] },
        { description: "E", priority: 1, effects: [] },
        { description: "F", priority: 1, effects: [] },
      ], factory), position: { playerIndex: 0, slot: 0 } });
    const victim = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Victim", maxHp: 50, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 } });
    const stateWithQueue: GameState = {
      ...createGameState(
        { playerIndex: 0, team: [actor] },
        { playerIndex: 1, team: [victim] },
      ),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(),
        actor.baseDie[0],
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
    ], factory);
    const actor = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Actor", maxHp: 100, baseSpeed: 0, baseDie: noOpDie, position: { playerIndex: 0, slot: 0 } });
    const targetChar = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Target", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 } });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor] }, { playerIndex: 1, team: [targetChar] }),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(),
        actor.baseDie[0],
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

  it('a boundary push-left Swap at slot 0 fizzles into an empty-changes step (not skipped)', () => {
    const swapDie = generateFullDie([
      { description: "A",        priority: 1, effects: [] },
      { description: "B",        priority: 1, effects: [] },
      { description: "C",        priority: 1, effects: [] },
      { description: "push-left", priority: 1, effects: [{ effect: EffectLabel.Swap, magnitude: 0, targets: [allyRel(0, -1)] }] },
      { description: "E",        priority: 1, effects: [] },
      { description: "F",        priority: 1, effects: [] },
    ], factory);
    const actor = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Swapper", maxHp: 100, baseSpeed: 0, baseDie: swapDie, position: { playerIndex: 0, slot: 0 } });
    const targetChar = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Target", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 } });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor] }, { playerIndex: 1, team: [targetChar] }),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(),
        actor.baseDie[3], // push-left face
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
    const actor1 = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Actor1", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 0, slot: 0 } });
    const actor2 = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Actor2", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 } });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor1] }, { playerIndex: 1, team: [actor2] }),
      priorityQueue: addEffectsToPriorityQueue(
        addEffectsToPriorityQueue(
          createPriorityQueue(),
          actor1.baseDie[0], // priority 1
          actor1.id,
          actor1.baseSpeed
        ),
        actor2.baseDie[0], // priority 1 — same bucket
        actor2.id,
        actor2.baseSpeed
      ),
    };

    const { log } = unstackPriorityQueueWithLog(stateWithQueue);

    expect(log).toHaveLength(2);
    expect(log.map(s => s.characterId)).toEqual(expect.arrayContaining([actor1.id, actor2.id]));
    expect(log.every(s => !s.skipped)).toBe(true);
  });

  it('skips entry if character is not found in any team', () => {
    const face: DieFace = {
        priority: 1,
        effects: [],
        description: 'test',
    };

    const team1 = [0, 1, 2, 3, 4].map(i =>
        createCharacter({ catalogId: TEST_CATALOG_ID, name: `T${i}`, maxHp: 100, baseSpeed: 5, baseDie: [face, face, face, face, face, face], position: { playerIndex: 0 as 0 | 1, slot: i as SlotIndex } })
    );
    const team2 = [0, 1, 2, 3, 4].map(i =>
        createCharacter({ catalogId: TEST_CATALOG_ID, name: `E${i}`, maxHp: 100, baseSpeed: 5, baseDie: [face, face, face, face, face, face], position: { playerIndex: 1 as 0 | 1, slot: i as SlotIndex } })
    );
    const player1 = createPlayer(team1, 0);
    const player2 = createPlayer(team2, 1);
    let gs = createGameState(player1, player2);
    gs = beginResolvePhase(gs);

    // Inject entry with non-existent character ID
    let queue = createPriorityQueue();
    queue = addEffectsToPriorityQueue(queue, face, 'NON_EXISTENT_ID', 1);
    gs = { ...gs, priorityQueue: queue };

    const { log } = unstackPriorityQueueWithLog(gs);

    expect(log).toHaveLength(1);
    expect(log[0].characterId).toBe('NON_EXISTENT_ID');
    expect(log[0].skipped).toBe(true);
  });

  it('an actor killed during resolution by a higher-priority action is marked skipped', () => {
    // killer uses face[3] (priority 2, damage 4) — resolves first
    // victim uses face[0] (priority 1, damage 1) — but is dead by then
    const killer = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Killer", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 0, slot: 0 } });
    const victim = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Victim", maxHp: 1, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 } });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [killer] }, { playerIndex: 1, team: [victim] }),
      priorityQueue: addEffectsToPriorityQueue(
        addEffectsToPriorityQueue(
          createPriorityQueue(),
          killer.baseDie[3], // priority 2, damage 4 → kills victim (hp 1)
          killer.id,
          killer.baseSpeed
        ),
        victim.baseDie[0], // priority 1 — victim already dead
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

  it('a self-targeted face resolves without throwing during unstacking', () => {
    const selfFace = generateFullDie(Array(6).fill(
        { description: 'self-only', priority: 1, effects: [{ effect: EffectLabel.Shield, magnitude: 2, targets: [allyRel(0)] }] },
    ) as unknown as BaseDieInstructions, factory)[0];
    const actor = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'SelfActor', maxHp: 100, baseSpeed: 0, baseDie: [selfFace, selfFace, selfFace, selfFace, selfFace, selfFace], position: { playerIndex: 0, slot: 0 as SlotIndex } });
    const enemy = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Enemy', maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 as SlotIndex } });
    const stateWithQueue: GameState = {
        ...createGameState({ playerIndex: 0, team: [actor] }, { playerIndex: 1, team: [enemy] }),
        priorityQueue: addEffectsToPriorityQueue(
            createPriorityQueue(),
            selfFace,
            actor.id,
            actor.baseSpeed,
        ),
    };
    expect(() => unstackPriorityQueueWithLog(stateWithQueue)).not.toThrow();
    const { state, log } = unstackPriorityQueueWithLog(stateWithQueue);
    expect(log[0].skipped).toBe(false);
    expect(state.players[0].team[0].shield).toBe(2);
  });

  it('a face with multiple effects resolves atomically in one log step', () => {
    const multiDie = generateFullDie([
      { description: "Damage+Shield", priority: 1, effects: [
        { effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(0)] },
        { effect: EffectLabel.Shield, magnitude: 5, targets: [enemyAbs(0)] },
      ]},
      { description: "B", priority: 1, effects: [] },
      { description: "C", priority: 1, effects: [] },
      { description: "D", priority: 1, effects: [] },
      { description: "E", priority: 1, effects: [] },
      { description: "F", priority: 1, effects: [] },
    ], factory);
    const actor = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Actor", maxHp: 100, baseSpeed: 0, baseDie: multiDie, position: { playerIndex: 0, slot: 0 } });
    const targetChar = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Target", maxHp: 100, baseSpeed: 0, baseDie: die, position: { playerIndex: 1, slot: 0 } });
    const stateWithQueue: GameState = {
      ...createGameState({ playerIndex: 0, team: [actor] }, { playerIndex: 1, team: [targetChar] }),
      priorityQueue: addEffectsToPriorityQueue(
        createPriorityQueue(),
        actor.baseDie[0],
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

  describe('Pokemon-style ordering', () => {
    const noop = (priority: number): DieFace => ({
      priority,
      effects: [],
      description: `noop@${priority}`,
    });
    const dieOf = (f: DieFace) => [f, f, f, f, f, f];

    const buildState = (
      entries: { face: DieFace; id: string; speed: number; playerIndex: 0 | 1 }[],
    ): GameState => {
      const a = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'A', maxHp: 100, baseSpeed: 0, baseDie: dieOf(noop(0)), position: { playerIndex: 0, slot: 0 } });
      const b = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'B', maxHp: 100, baseSpeed: 0, baseDie: dieOf(noop(0)), position: { playerIndex: 1, slot: 0 } });
      const charA = { ...a, id: entries[0].id };
      const charB = { ...b, id: entries[1].id };
      let q = createPriorityQueue();
      for (const e of entries) {
        q = addEffectsToPriorityQueue(q, e.face, e.id, e.speed);
      }
      return {
        ...createGameState({ playerIndex: 0, team: [charA] }, { playerIndex: 1, team: [charB] }),
        priorityQueue: q,
      };
    };

    it('a higher bracket resolves before a lower bracket, regardless of speed', () => {
      const state = buildState([
        { face: noop(0), id: 'fast-low', speed: 100, playerIndex: 0 },
        { face: noop(1), id: 'slow-high', speed: 0, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log[0].characterId).toBe('slow-high');
      expect(log[1].characterId).toBe('fast-low');
    });

    it('within the same bracket, the faster character resolves first', () => {
      const state = buildState([
        { face: noop(1), id: 'fast', speed: 9, playerIndex: 0 },
        { face: noop(1), id: 'slow', speed: 1, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log[0].characterId).toBe('fast');
      expect(log[1].characterId).toBe('slow');
    });

    it('a negative bracket resolves last', () => {
      const state = buildState([
        { face: noop(-1), id: 'last', speed: 100, playerIndex: 0 },
        { face: noop(0), id: 'first', speed: 0, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log[0].characterId).toBe('first');
      expect(log[1].characterId).toBe('last');
    });

    it('equal bracket and equal speed both resolve (order not asserted)', () => {
      const state = buildState([
        { face: noop(0), id: 'x', speed: 5, playerIndex: 0 },
        { face: noop(0), id: 'y', speed: 5, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log).toHaveLength(2);
      expect(log.map(s => s.characterId)).toEqual(expect.arrayContaining(['x', 'y']));
    });

    describe('initiative breaks exact ties', () => {
      afterEach(() => jest.restoreAllMocks());

      const tied = (initiative: PlayerIndex): GameState => ({
        ...buildState([
          { face: noop(0), id: 'p0-actor', speed: 5, playerIndex: 0 },
          { face: noop(0), id: 'p1-actor', speed: 5, playerIndex: 1 },
        ]),
        initiativePlayerIndex: initiative,
      });

      it('with equal bracket and speed, the initiative holder resolves first', () => {
        expect(unstackPriorityQueueWithLog(tied(0)).log.map(s => s.characterId)).toEqual(['p0-actor', 'p1-actor']);
        expect(unstackPriorityQueueWithLog(tied(1)).log.map(s => s.characterId)).toEqual(['p1-actor', 'p0-actor']);
      });

      it('never beats a higher speed in the same bracket', () => {
        const state: GameState = {
          ...buildState([
            { face: noop(0), id: 'holder-slow', speed: 1, playerIndex: 0 },
            { face: noop(0), id: 'other-fast', speed: 9, playerIndex: 1 },
          ]),
          initiativePlayerIndex: 0,
        };
        expect(unstackPriorityQueueWithLog(state).log.map(s => s.characterId)).toEqual(['other-fast', 'holder-slow']);
      });

      it('never beats a higher bracket', () => {
        const state: GameState = {
          ...buildState([
            { face: noop(0), id: 'holder-low', speed: 5, playerIndex: 0 },
            { face: noop(1), id: 'other-high', speed: 5, playerIndex: 1 },
          ]),
          initiativePlayerIndex: 0,
        };
        expect(unstackPriorityQueueWithLog(state).log.map(s => s.characterId)).toEqual(['other-high', 'holder-low']);
      });

      it('inside one team, equal bracket and speed go by slot ascending whatever the array order', () => {
        const at = (slot: SlotIndex, id: string) => ({
          ...createCharacter({ catalogId: TEST_CATALOG_ID, name: id, maxHp: 100, baseSpeed: 5, baseDie: dieOf(noop(0)), position: { playerIndex: 0, slot } }),
          id,
        });
        const high = at(3, 'slot-3');
        const low = at(1, 'slot-1');
        const state: GameState = {
          ...createGameState({ playerIndex: 0, team: [high, low] }, { playerIndex: 1, team: [] }),
          priorityQueue: [
            [noop(0), high.id, 5] as const,
            [noop(0), low.id, 5] as const,
          ],
        };
        expect(unstackPriorityQueueWithLog(state).log.map(s => s.characterId)).toEqual(['slot-1', 'slot-3']);
      });

      it('beats the slot: a holder in slot 4 still resolves before a rival in slot 0', () => {
        const at = (playerIndex: PlayerIndex, slot: SlotIndex, id: string) => ({
          ...createCharacter({ catalogId: TEST_CATALOG_ID, name: id, maxHp: 100, baseSpeed: 5, baseDie: dieOf(noop(0)), position: { playerIndex, slot } }),
          id,
        });
        const rival = at(0, 0, 'rival-slot-0');
        const holder = at(1, 4, 'holder-slot-4');
        const state: GameState = {
          ...createGameState({ playerIndex: 0, team: [rival] }, { playerIndex: 1, team: [holder] }, 1),
          priorityQueue: [
            [noop(0), rival.id, 5] as const,
            [noop(0), holder.id, 5] as const,
          ],
        };
        expect(unstackPriorityQueueWithLog(state).log.map(s => s.characterId)).toEqual(['holder-slot-4', 'rival-slot-0']);
      });

      it('an actor missing from the state sorts as a non-holder in slot 0, and is skipped', () => {
        const present = {
          ...createCharacter({ catalogId: TEST_CATALOG_ID, name: 'present', maxHp: 100, baseSpeed: 5, baseDie: dieOf(noop(0)), position: { playerIndex: 1, slot: 2 } }),
          id: 'present-slot-2',
        };
        const state: GameState = {
          ...createGameState({ playerIndex: 0, team: [] }, { playerIndex: 1, team: [present] }, 0),
          priorityQueue: [
            [noop(0), present.id, 5] as const,
            [noop(0), 'missing', 5] as const,
          ],
        };
        const { log } = unstackPriorityQueueWithLog(state);
        expect(log.map(s => s.characterId)).toEqual(['missing', 'present-slot-2']);
        expect(log[0].skipped).toBe(true);
      });

      it('resolves without any random call', () => {
        const random = jest.spyOn(Math, 'random');
        unstackPriorityQueueWithLog(tied(0));
        expect(random).not.toHaveBeenCalled();
      });
    });

    it('a dead high-bracket actor is skipped but keeps its place in the ordering', () => {
      const deadHigh = loseHp(createCharacter({ catalogId: TEST_CATALOG_ID, name: 'DeadHigh', maxHp: 100, baseSpeed: 0, baseDie: dieOf(noop(1)), position: { playerIndex: 0, slot: 0 } }), 100);
      const liveLow = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'LiveLow', maxHp: 100, baseSpeed: 0, baseDie: dieOf(noop(0)), position: { playerIndex: 1, slot: 0 } });
      let q = createPriorityQueue();
      q = addEffectsToPriorityQueue(q, noop(1), deadHigh.id, 0);
      q = addEffectsToPriorityQueue(q, noop(0), liveLow.id, 0);
      const state: GameState = {
        ...createGameState({ playerIndex: 0, team: [deadHigh] }, { playerIndex: 1, team: [liveLow] }),
        priorityQueue: q,
      };

      const { log } = unstackPriorityQueueWithLog(state);

      expect(log).toHaveLength(2);
      expect(log[0].characterId).toBe(deadHigh.id);
      expect(log[0].skipped).toBe(true);
      expect(log[1].characterId).toBe(liveLow.id);
      expect(log[1].skipped).toBe(false);
    });
  });

  describe('stat changes inside the round', () => {
    const dieOfFace = (effects: EffectEntry[], priority = 0) =>
      generateFullDie(Array(6).fill({ description: 'f', priority, effects }) as unknown as BaseDieInstructions, factory);
    const hero = (name: string, speed: number, playerIndex: PlayerIndex, slot: SlotIndex, effects: EffectEntry[]) =>
      createCharacter({ catalogId: TEST_CATALOG_ID, name, maxHp: 100, baseSpeed: speed, baseDie: dieOfFace(effects), position: { playerIndex, slot } });
    const buffAlly = (value: number): EffectEntry => ({ effect: EffectLabel.ApplyStat, stat: 'POWER', magnitude: value, duration: 2, targets: [allyAbs(1)] });
    const hit = (amount: number): EffectEntry => ({ effect: EffectLabel.Damage, magnitude: amount, targets: [enemyAbs(0)] });

    it('a faster buff applies to a slower ally acting later in the same resolution', () => {
      const buffer = hero('buffer', 9, 0, 0, [buffAlly(3)]);
      const attacker = hero('attacker', 3, 0, 1, [hit(5)]);
      const dummy = hero('dummy', 1, 1, 0, []);
      const state = addAllEffectsToPriorityQueue(createGameState(createPlayer([buffer, attacker], 0), createPlayer([dummy], 1)));

      const { state: after } = unstackPriorityQueueWithLog(state);

      expect(after.players[1].team[0].hp).toBe(100 - 8);
    });

    it('a buff placed before the damage in one face already counts for that damage', () => {
      const self: EffectEntry = { effect: EffectLabel.ApplyStat, stat: 'POWER', magnitude: 3, duration: 2, targets: [allyRel(0)] };
      const actor = hero('actor', 5, 0, 0, [self, hit(5)]);
      const dummy = hero('dummy', 1, 1, 0, []);
      const state = addAllEffectsToPriorityQueue(createGameState(createPlayer([actor], 0), createPlayer([dummy], 1)));

      const { state: after } = unstackPriorityQueueWithLog(state);

      expect(after.players[1].team[0].hp).toBe(100 - 8);
    });

    const exposeEnemy = (value: number): EffectEntry => ({ effect: EffectLabel.ApplyStat, stat: 'ARMOR', magnitude: value, duration: 2, targets: [enemyAbs(0)] });

    it('a faster ARMOR debuff applies to a hit resolved later in the same resolution', () => {
      const debuffer = hero('debuffer', 9, 0, 0, [exposeEnemy(-3)]);
      const attacker = hero('attacker', 3, 0, 1, [hit(5)]);
      const dummy = hero('dummy', 1, 1, 0, []);
      const state = addAllEffectsToPriorityQueue(createGameState(createPlayer([debuffer, attacker], 0), createPlayer([dummy], 1)));

      const { state: after } = unstackPriorityQueueWithLog(state);

      expect(after.players[1].team[0].hp).toBe(100 - 8);
    });

    it('a slower ARMOR buff on the target does not reduce a faster hit that already resolved', () => {
      const attacker = hero('attacker', 9, 0, 0, [hit(5)]);
      const guard: EffectEntry = { effect: EffectLabel.ApplyStat, stat: 'ARMOR', magnitude: 3, duration: 2, targets: [allyRel(0)] };
      const defender = hero('defender', 3, 1, 0, [guard]);
      const state = addAllEffectsToPriorityQueue(createGameState(createPlayer([attacker], 0), createPlayer([defender], 1)));

      const { state: after } = unstackPriorityQueueWithLog(state);

      expect(after.players[1].team[0].hp).toBe(100 - 5);
    });

    it('a slower buff does not apply to a faster ally that already acted', () => {
      const buffer = hero('buffer', 3, 0, 0, [buffAlly(3)]);
      const attacker = hero('attacker', 9, 0, 1, [hit(5)]);
      const dummy = hero('dummy', 1, 1, 0, []);
      const state = addAllEffectsToPriorityQueue(createGameState(createPlayer([buffer, attacker], 0), createPlayer([dummy], 1)));

      const { state: after } = unstackPriorityQueueWithLog(state);

      expect(after.players[1].team[0].hp).toBe(100 - 5);
    });
  });

  describe('STUN', () => {
    const dieOfFace = (effects: EffectEntry[], priority = 0) =>
      generateFullDie(Array(6).fill({ description: 'f', priority, effects }) as unknown as BaseDieInstructions, factory);
    const hero = (name: string, speed: number, playerIndex: PlayerIndex, slot: SlotIndex, effects: EffectEntry[]) =>
      createCharacter({ catalogId: TEST_CATALOG_ID, name, maxHp: 100, baseSpeed: speed, baseDie: dieOfFace(effects), position: { playerIndex, slot } });
    const hit = (amount: number): EffectEntry => ({ effect: EffectLabel.Damage, magnitude: amount, targets: [enemyAbs(0)] });
    const stunEnemy = (duration: number): EffectEntry => ({ effect: EffectLabel.ApplyState, state: 'STUN', duration, targets: [enemyAbs(0)] });
    const stunned = (c: ReturnType<typeof hero>, value = 1) => ({ ...c, states: { STUN: { value, touchedRound: 0 } } });
    const build = (a: ReturnType<typeof hero>[], b: ReturnType<typeof hero>[]) =>
      addAllEffectsToPriorityQueue(createGameState(createPlayer(a, 0), createPlayer(b, 1)));

    it('a stunned character does not act and is logged as skipped', () => {
      const attacker = stunned(hero('attacker', 5, 0, 0, [hit(5)]));
      const dummy = hero('dummy', 1, 1, 0, []);

      const { state, log } = unstackPriorityQueueWithLog(build([attacker], [dummy]));

      expect(state.players[1].team[0].hp).toBe(100);
      expect(log[0]).toMatchObject({ characterId: attacker.id, skipped: true, effects: [], changes: [] });
    });

    it('a stun landing before the victim acts cancels its action', () => {
      const stunner = hero('stunner', 9, 0, 0, [stunEnemy(1)]);
      const victim = hero('victim', 3, 1, 0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);

      const { state, log } = unstackPriorityQueueWithLog(build([stunner], [victim]));

      expect(state.players[0].team[0].hp).toBe(100);
      expect(log[1]).toMatchObject({ characterId: victim.id, skipped: true });
    });

    it('a stun landing after the victim acted does not cancel that action', () => {
      const stunner = hero('stunner', 3, 0, 0, [stunEnemy(1)]);
      const victim = hero('victim', 9, 1, 0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);

      const { state, log } = unstackPriorityQueueWithLog(build([stunner], [victim]));

      expect(state.players[0].team[0].hp).toBe(95);
      expect(log[0]).toMatchObject({ characterId: victim.id, skipped: false });
    });

    it('a stunned character is still a valid target', () => {
      const attacker = hero('attacker', 5, 0, 0, [hit(5)]);
      const victim = stunned(hero('victim', 1, 1, 0, []));

      const { state } = unstackPriorityQueueWithLog(build([attacker], [victim]));

      expect(state.players[1].team[0].hp).toBe(95);
    });

    it('STUN 1 applied in a round also cancels the action of the next round', () => {
      const stunner = hero('stunner', 9, 0, 0, [stunEnemy(1)]);
      const victim = hero('victim', 3, 1, 0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);
      const round1 = unstackPriorityQueueWithLog(build([stunner], [victim])).state;

      const nextRound = endOfRound(round1);
      // The stunner rests in round 2, so only the carried-over stun is in play.
      const resting = { description: 'rest', priority: 0, effects: [] };
      const quiet = { ...nextRound, players: [{ ...nextRound.players[0], team: [{ ...nextRound.players[0].team[0], face: resting }] }, nextRound.players[1]] as GameState['players'] };
      const refilled = addAllEffectsToPriorityQueue(quiet);
      const { state: round2, log } = unstackPriorityQueueWithLog(refilled);

      expect(log.find(step => step.characterId === victim.id)).toMatchObject({ skipped: true });
      expect(round2.players[0].team[0].hp).toBe(100);
      expect(endOfRound(round2).players[1].team[0].states.STUN).toBeUndefined();
    });
  });

  describe('auto-targeting at resolution time', () => {
    const factory = buildEffectFactory();
    const face = (priority: number, effects: EffectEntry[]) =>
      generateFullDie(Array(6).fill({ description: 'f', priority, effects }) as unknown as BaseDieInstructions, factory)[0];
    const idle = face(0, []);
    const mk = (name: string, speed: number, f: DieFace, pi: PlayerIndex, slot: number) =>
      ({ ...createCharacter({ catalogId: TEST_CATALOG_ID, name, maxHp: 20, baseSpeed: speed, baseDie: [f, f, f, f, f, f], position: { playerIndex: pi, slot: slot as SlotIndex } }), face: f });
    const teamOf = (pi: PlayerIndex, overrides: Record<number, DieFace> = {}, speeds: Record<number, number> = {}) =>
      createPlayer([0, 1, 2, 3, 4].map(s => mk(`${pi}-${s}`, speeds[s] ?? 1, overrides[s] ?? idle, pi, s)), pi);
    const run = (p0: Player, p1: Player) => {
      const gs = addAllEffectsToPriorityQueue(createGameState(p0, p1));
      return unstackPriorityQueueWithLog(gs);
    };
    const hp = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot].hp;

    it('queues every character, one entry each, as [face, actorId, speed]', () => {
      const gs = addAllEffectsToPriorityQueue(createGameState(teamOf(0), teamOf(1)));
      expect(gs.priorityQueue).toHaveLength(10);
      const [f, id, speed] = gs.priorityQueue[0];
      expect(f).toBe(idle);
      expect(id).toBe(gs.players[0].team[0].id);
      expect(speed).toBe(1);
    });

    it('a relative attack hits the enemy facing the actor', () => {
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const { state } = run(teamOf(0, { 2: hit }), teamOf(1));
      expect(hp(state, 1, 2)).toBe(15);
      expect(hp(state, 1, 1)).toBe(20);
    });

    it('logs the cells each effect actually resolved to', () => {
      const hit = face(0, [
        { effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(-1, 0, 1)] },
        { effect: EffectLabel.Shield, magnitude: 1, targets: [allyRel(0)] },
      ]);
      const { log } = run(teamOf(0, { 0: hit }), teamOf(1));
      const step = log.find(s => s.effects.length === 2)!;
      expect(step.effects[0]).toEqual({ effect: EffectLabel.Damage, targets: [{ playerIndex: 1, slot: 0 }, { playerIndex: 1, slot: 1 }] });
      expect(step.effects[1]).toEqual({ effect: EffectLabel.Shield, targets: [{ playerIndex: 0, slot: 0 }] });
    });

    it('an effect whose cells are all off the board fizzles and logs targets []', () => {
      const miss = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(-1)] }]);
      const { state, log } = run(teamOf(0, { 0: miss }), teamOf(1));
      expect(state.players[1].team.every(c => c.hp === 20)).toBe(true);
      const step = log.find(s => s.effects.length === 1)!;
      expect(step).toMatchObject({ skipped: false, effects: [{ effect: EffectLabel.Damage, targets: [] }], changes: [] });
    });

    it('relative cells follow an actor moved earlier in the round', () => {
      // Fast ally at slot 0 swaps itself with the slow attacker at slot 2 → attacker now at slot 0.
      const moveAttacker = face(1, [{ effect: EffectLabel.Swap, magnitude: 0, targets: [allyAbs(0, 2)] }]);
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const { state } = run(teamOf(0, { 0: moveAttacker, 2: hit }), teamOf(1));
      expect(hp(state, 1, 0)).toBe(15);
      expect(hp(state, 1, 2)).toBe(20);
    });

    it('relative cells target a slot, so they hit whoever stands there now', () => {
      // Enemy slot 1 swaps its slots 2 and 3 first (bracket 1); then our attacker at slot 2 hits enemy slot 2.
      const enemySwap = face(1, [{ effect: EffectLabel.Swap, magnitude: 0, targets: [allyAbs(2, 3)] }]);
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const p1 = teamOf(1, { 1: enemySwap });
      const wasAtSlot3 = p1.team[3].id;
      const { state } = run(teamOf(0, { 2: hit }), p1);
      expect(state.players[1].team[2].id).toBe(wasAtSlot3);
      expect(hp(state, 1, 2)).toBe(15);
    });

    it('effects of one face resolve in order: a self-move shifts the next effect', () => {
      const moveThenHit = face(0, [
        { effect: EffectLabel.Swap, magnitude: 0, targets: [allyRel(0), allyAbs(4)] },
        { effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] },
      ]);
      const { state } = run(teamOf(0, { 1: moveThenHit }), teamOf(1));
      expect(hp(state, 1, 4)).toBe(15);
      expect(hp(state, 1, 1)).toBe(20);
    });

    it('a dead actor is skipped with no effects logged', () => {
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const p0 = teamOf(0, { 0: hit });
      const deadP0 = { ...p0, team: p0.team.map((c, i) => i === 0 ? { ...c, hp: 0 } : c) };
      const { state, log } = run(deadP0, teamOf(1));
      expect(hp(state, 1, 0)).toBe(20);
      expect(log.find(s => s.characterId === deadP0.team[0].id)).toEqual(
        { characterId: deadP0.team[0].id, skipped: true, effects: [], changes: [] });
    });
  });
});
