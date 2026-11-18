import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, createCharacterFromTemplate, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { CatalogId } from "@shared/branded.types";
import { createGameState } from "./helpers/gameState";
import { createPlayer } from "@domain/services/Player.service";
import FixedDamage from "@domain/strategies/FixedDamage.class";
import { effectFor } from "@domain/strategies/effectFor";

describe('CharacterGenerationService', () => {

  const jsonTemplate = JSON.stringify({
    name: "TestCharacter",
    maxHp: 100,
    baseSpeed: 5,
    baseDieInstructions: [
      { description: "Deals 1 damage", priority: 1, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
      { description: "Heals 2 HP", priority: 1, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }], parts: [{ part: EffectLabel.Heal, magnitude: 2 }] }] },
      { description: "Grants 3 shield", priority: 1, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }], parts: [{ part: EffectLabel.Shield, magnitude: 3 }] }] },
      { description: "Deals 4 damage", priority: 2, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: EffectLabel.Damage, magnitude: 4 }] }] },
      { description: "Heals 5 HP", priority: 2, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }], parts: [{ part: EffectLabel.Heal, magnitude: 5 }] }] },
      { description: "Grants 6 shield", priority: 2, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }], parts: [{ part: EffectLabel.Shield, magnitude: 6 }] }] },
    ],
  });

  it('should create a character from JSON template', () => {
    const character = createCharacterFromTemplate(JSON.parse(jsonTemplate));
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
    expect(character.baseSpeed).toBe(5);
  });

  it('should create a character with specified attributes', () => {
    const die = generateFullDie(JSON.parse(jsonTemplate).baseDieInstructions);
    const character = createCharacter({ catalogId: 'test-char' as CatalogId, name: "TestCharacter", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
    expect(character.catalogId).toBe('test-char');
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
    expect(character.baseSpeed).toBe(5);
  });

  it('copies the template id into catalogId', () => {
    const template = { ...JSON.parse(jsonTemplate), id: 'test-char' };
    const character = createCharacterFromTemplate(template);
    expect(character.catalogId).toBe('test-char');
    expect(character.name).toBe("TestCharacter");
  });

  it('ROLL-2: a new character has no die kept at a last Roll', () => {
    const template = { ...JSON.parse(jsonTemplate), id: 'test-char' };
    expect(createCharacterFromTemplate(template).keptAtLastRoll).toBe(false);
  });

  it('gives each built character its own instance id', () => {
    const template = { ...JSON.parse(jsonTemplate), id: 'test-char' };
    const a = createCharacterFromTemplate(template);
    const b = createCharacterFromTemplate(template);
    expect(a.id).not.toBe(b.id);
    expect(a.catalogId).toBe(b.catalogId);
  });

  it('carries label, magnitude and targets on each face effect', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }], parts: [{ part: 'Damage', magnitude: 4 }] }] }) });
    const c = createCharacterFromTemplate(JSON.parse(json));
    expect(c.baseDie[0].effects[0]).toMatchObject({
      targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }], parts: [{ label: 'Damage', magnitude: 4 }],
    });
  });

  it('carries the parts of a template effect, in order, on the face effect', () => {
    const targets = [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }];
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets, parts: [{ part: 'Damage', magnitude: 4 }, { part: 'ApplyState', state: 'POISON', duration: 2 }] }] }) });
    const c = createCharacterFromTemplate(JSON.parse(json));
    expect(c.baseDie[0].effects).toEqual([{
      targets,
      parts: [{ label: 'Damage', magnitude: 4 }, { label: 'ApplyState', magnitude: 0, state: 'POISON', duration: 2 }],
    }]);
  });

  it('builds a face from a FixedDamage entry using the FixedDamage strategy', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'FixedDamage', magnitude: 3 }] }] }) });
    const c = createCharacterFromTemplate(JSON.parse(json));
    expect(c.baseDie[0].effects[0].parts[0]).toMatchObject({ label: 'FixedDamage', magnitude: 3 });
    expect(effectFor(c.baseDie[0].effects[0].parts[0])).toBeInstanceOf(FixedDamage);
  });

  it('the built FixedDamage lowers hp by the template magnitude, shield untouched', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'FixedDamage', magnitude: 3 }] }] }) });
    const built = createCharacterFromTemplate(JSON.parse(json));
    const victim = { ...createCharacter({ catalogId: built.catalogId, name: 'V', maxHp: 10, baseSpeed: 1, baseDie: built.baseDie, position: { playerIndex: 0, slot: 0 } }), shield: 4 };
    const state = createGameState(createPlayer([victim], 0), createPlayer([], 1));

    const { state: after } = effectFor(built.baseDie[0].effects[0].parts[0]).solve(state, [{ playerIndex: 0, slot: 0 }], victim.id);

    expect(after.players[0].team[0].hp).toBe(7);
    expect(after.players[0].team[0].shield).toBe(4);
  });

  it('builds an ApplyStat face whose effect adds the template stat, value and duration', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyStat', stat: 'POWER', magnitude: -3, duration: 2 }] }] }) });
    const built = createCharacterFromTemplate(JSON.parse(json));
    const target = createCharacter({ catalogId: built.catalogId, name: 'V', maxHp: 10, baseSpeed: 1, baseDie: built.baseDie, position: { playerIndex: 0, slot: 0 } });
    const state = { ...createGameState(createPlayer([target], 0), createPlayer([], 1)), currentRound: 4 };

    const { state: after } = effectFor(built.baseDie[0].effects[0].parts[0]).solve(state, [{ playerIndex: 0, slot: 0 }], target.id);

    expect(after.players[0].team[0].modifiers).toEqual([{ stat: 'POWER', value: -3, roundsLeft: 2, appliedRound: 4 }]);
    expect(built.baseDie[0].effects[0].parts[0]).toMatchObject({ label: 'ApplyStat', magnitude: -3, stat: 'POWER', duration: 2 });
  });

  it('builds an ApplyStat face for ARMOR whose effect adds that instance', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyStat', stat: 'ARMOR', magnitude: -3, duration: 2 }] }] }) });
    const built = createCharacterFromTemplate(JSON.parse(json));
    const target = createCharacter({ catalogId: built.catalogId, name: 'V', maxHp: 10, baseSpeed: 1, baseDie: built.baseDie, position: { playerIndex: 1, slot: 0 } });
    const state = { ...createGameState(createPlayer([], 0), createPlayer([target], 1)), currentRound: 2 };

    const { state: after } = effectFor(built.baseDie[0].effects[0].parts[0]).solve(state, [{ playerIndex: 1, slot: 0 }], target.id);

    expect(after.players[1].team[0].modifiers).toEqual([{ stat: 'ARMOR', value: -3, roundsLeft: 2, appliedRound: 2 }]);
    expect(built.baseDie[0].effects[0].parts[0]).toMatchObject({ label: 'ApplyStat', stat: 'ARMOR', duration: 2 });
  });

  it('builds an ApplyState face whose effect puts the template state and duration on the axis', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyState', state: 'SLOW', duration: 2 }] }] }) });
    const built = createCharacterFromTemplate(JSON.parse(json));
    const target = createCharacter({ catalogId: built.catalogId, name: 'V', maxHp: 10, baseSpeed: 1, baseDie: built.baseDie, position: { playerIndex: 1, slot: 0 } });
    const state = { ...createGameState(createPlayer([], 0), createPlayer([target], 1)), currentRound: 4 };

    const { state: after } = effectFor(built.baseDie[0].effects[0].parts[0]).solve(state, [{ playerIndex: 1, slot: 0 }], target.id);

    expect(after.players[1].team[0].states).toEqual({ SPEED: { value: -2, touchedRound: 4 } });
    expect(built.baseDie[0].effects[0].parts[0]).toMatchObject({ label: 'ApplyState', magnitude: 0, state: 'SLOW', duration: 2 });
  });

  it.each([
    ['unknown stat', { stat: 'LUCK', magnitude: 3, duration: 2 }],
    ['missing stat', { magnitude: 3, duration: 2 }],
    ['zero magnitude', { stat: 'POWER', magnitude: 0, duration: 2 }],
    ['fractional magnitude', { stat: 'POWER', magnitude: 1.5, duration: 2 }],
    ['zero duration', { stat: 'POWER', magnitude: 3, duration: 0 }],
    ['negative duration', { stat: 'POWER', magnitude: 3, duration: -1 }],
    ['fractional duration', { stat: 'POWER', magnitude: 3, duration: 1.5 }],
    ['missing duration', { stat: 'POWER', magnitude: 3 }],
  ])('throws on invalid ApplyStat parameters (%s)', (_label, params) => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyStat', ...params }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow(/Invalid stat parameters/);
  });

  it.each([
    ['unknown state', { state: 'FROZEN', duration: 1 }],
    ['a stat name given as a state', { state: 'POWER', duration: 1 }],
    ['missing state', { duration: 1 }],
    ['zero duration', { state: 'STUN', duration: 0 }],
    ['negative duration', { state: 'STUN', duration: -1 }],
    ['fractional duration', { state: 'STUN', duration: 1.5 }],
    ['missing duration', { state: 'STUN' }],
    ['a stray magnitude', { state: 'STUN', duration: 1, magnitude: 2 }],
    ['a stray stat', { state: 'STUN', duration: 1, stat: 'POWER' }],
  ])('throws on invalid ApplyState parameters (%s)', (_label, params) => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyState', ...params }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow(/Invalid state parameters/);
  });

  it.each(['HASTE', 'SLOW', 'REGEN', 'POISON', 'STUN', 'ROOT', 'DIVINE_SHIELD'])('accepts the state %s', (state) => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyState', state, duration: 1 }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).not.toThrow();
  });

  it.each([
    ['empty targets', []],
    ['slot out of range', [{ side: 'ENEMY', mode: 'ABSOLUTE', n: [7] }]],
    ['missing targets', undefined],
  ])('throws on invalid targets (%s)', (_label, targets) => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets, parts: [{ part: 'Damage', magnitude: 4 }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow(/Invalid targets/);
  });

  it('throws on a Swap with 3 cells', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ALLY', mode: 'ABSOLUTE', n: [0, 1, 2] }], parts: [{ part: 'Swap', magnitude: 0 }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow(/Invalid targets/);
  });

  it('throws on an unknown effect label', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'SingleTargetDamage', magnitude: 4 }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow();
  });

  it.each([
    ['no parts', { targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [] }],
    ['the flat shape, without parts', { effect: 'Damage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }],
  ])('throws on an effect with %s', (_label, effect) => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'Bite', priority: 0, effects: [effect] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json)))
      .toThrow('Invalid effect on face "Bite": an effect needs at least one part');
  });
});

describe('template error messages', () => {
  const build = (effect: object) => () => createCharacterFromTemplate(JSON.parse(JSON.stringify({
    name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill({ description: 'Bite', priority: 0, effects: [effect] }),
  })));

  it('names the effect, the face and the target problem', () => {
    expect(build({ targets: [], parts: [{ part: 'Damage', magnitude: 1 }] }))
      .toThrow('Invalid targets for effect "Damage" on face "Bite": targets must be a non-empty array');
  });

  it.each([
    ['after it', [{ part: 'Swap', magnitude: 0 }, { part: 'Damage', magnitude: 3 }]],
    ['before it', [{ part: 'Shield', magnitude: 3 }, { part: 'Swap', magnitude: 0 }]],
  ])('SWAP-1: throws on a Swap that shares its effect with another part (%s)', (_label, parts) => {
    expect(build({ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0, 1] }], parts }))
      .toThrow('Invalid effect on face "Bite": a Swap is the only part of its effect');
  });

  it('names the effect, the face and the stat problem', () => {
    expect(build({ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyStat', stat: 'POWER', magnitude: 0, duration: 1 }] }))
      .toThrow('Invalid stat parameters for effect "ApplyStat" on face "Bite": magnitude must be a non-zero integer');
  });

  it('names the effect, the face and the state problem', () => {
    expect(build({ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyState', state: 'STUN', duration: 0 }] }))
      .toThrow('Invalid state parameters for effect "ApplyState" on face "Bite": duration must be an integer >= 1');
  });
});

describe('template error messages with several problems', () => {
  it('separates the problems with a semicolon', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'Bite', priority: 0, effects: [{ targets: [{ side: 'FOE', mode: 'NEAR', n: [0] }], parts: [{ part: 'Damage', magnitude: 1 }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow(
      'Invalid targets for effect "Damage" on face "Bite": group 0: side must be ALLY or ENEMY; group 0: mode must be ABSOLUTE or RELATIVE');
  });

  it('separates stat problems with a semicolon', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'Bite', priority: 0, effects: [{ targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyStat', stat: 'POWER', magnitude: 0, duration: 0 }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow(': magnitude must be a non-zero integer; duration must be an integer >= 1');
  });

  it('separates state problems with a semicolon', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'Bite', priority: 0, effects: [{ targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }], parts: [{ part: 'ApplyState', state: 'STUN', duration: 0, magnitude: 1 }] }] }) });
    expect(() => createCharacterFromTemplate(JSON.parse(json))).toThrow(': a state has no magnitude; duration must be an integer >= 1');
  });
});
