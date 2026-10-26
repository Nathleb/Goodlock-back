import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, createCharacterFromJsonTemplate, createCharacterFromTemplate, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { CatalogId } from "@shared/branded.types";
import { buildEffectFactory, createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import FixedDamage from "@domain/strategies/FixedDamage.class";

describe('CharacterGenerationService', () => {
  const factory = buildEffectFactory();

  const jsonTemplate = JSON.stringify({
    name: "TestCharacter",
    maxHp: 100,
    baseSpeed: 5,
    baseDieInstructions: [
      { description: "Deals 1 damage", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }] },
      { description: "Heals 2 HP", priority: 1, effects: [{ effect: EffectLabel.Heal, magnitude: 2, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }] }] },
      { description: "Grants 3 shield", priority: 1, effects: [{ effect: EffectLabel.Shield, magnitude: 3, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }] }] },
      { description: "Deals 4 damage", priority: 2, effects: [{ effect: EffectLabel.Damage, magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }] },
      { description: "Heals 5 HP", priority: 2, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }] }] },
      { description: "Grants 6 shield", priority: 2, effects: [{ effect: EffectLabel.Shield, magnitude: 6, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [1] }] }] },
    ],
  });

  it('should create a character from JSON template', () => {
    const character = createCharacterFromJsonTemplate(jsonTemplate, factory);
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
    expect(character.baseSpeed).toBe(5);
  });

  it('should create a character with specified attributes', () => {
    const die = generateFullDie(JSON.parse(jsonTemplate).baseDieInstructions, factory);
    const character = createCharacter({ catalogId: 'test-char' as CatalogId, name: "TestCharacter", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
    expect(character.catalogId).toBe('test-char');
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
    expect(character.baseSpeed).toBe(5);
  });

  it('copies the template id into catalogId', () => {
    const template = { ...JSON.parse(jsonTemplate), id: 'test-char' };
    const character = createCharacterFromTemplate(template, factory);
    expect(character.catalogId).toBe('test-char');
    expect(character.name).toBe("TestCharacter");
  });

  it('gives each built character its own instance id', () => {
    const template = { ...JSON.parse(jsonTemplate), id: 'test-char' };
    const a = createCharacterFromTemplate(template, factory);
    const b = createCharacterFromTemplate(template, factory);
    expect(a.id).not.toBe(b.id);
    expect(a.catalogId).toBe(b.catalogId);
  });

  it('carries label, magnitude and targets on each face effect', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'Damage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }] }] }) });
    const c = createCharacterFromJsonTemplate(json, factory);
    expect(c.baseDie[0].effects[0]).toMatchObject({
      label: 'Damage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }],
    });
  });

  it('builds a face from a FixedDamage entry using the FixedDamage strategy', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'FixedDamage', magnitude: 3, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }] }] }) });
    const c = createCharacterFromJsonTemplate(json, factory);
    expect(c.baseDie[0].effects[0]).toMatchObject({ label: 'FixedDamage', magnitude: 3 });
    expect(c.baseDie[0].effects[0].impl).toBeInstanceOf(FixedDamage);
  });

  it('the built FixedDamage lowers hp by the template magnitude, shield untouched', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'FixedDamage', magnitude: 3, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0] }] }] }) });
    const built = createCharacterFromJsonTemplate(json, factory);
    const victim = { ...createCharacter({ catalogId: built.catalogId, name: 'V', maxHp: 10, baseSpeed: 1, baseDie: built.baseDie, position: { playerIndex: 0, slot: 0 } }), shield: 4 };
    const state = createGameState(createPlayer([victim], 0), createPlayer([], 1));

    const { state: after } = built.baseDie[0].effects[0].impl.solve(state, [{ playerIndex: 0, slot: 0 }], victim.id);

    expect(after.players[0].team[0].hp).toBe(7);
    expect(after.players[0].team[0].shield).toBe(4);
  });

  it.each([
    ['empty targets', []],
    ['slot out of range', [{ side: 'ENEMY', mode: 'ABSOLUTE', n: [7] }]],
    ['missing targets', undefined],
  ])('throws on invalid targets (%s)', (_label, targets) => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'Damage', magnitude: 4, targets }] }) });
    expect(() => createCharacterFromJsonTemplate(json, factory)).toThrow(/Invalid targets/);
  });

  it('throws on a Swap with 3 cells', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'Swap', magnitude: 0, targets: [{ side: 'ALLY', mode: 'ABSOLUTE', n: [0, 1, 2] }] }] }) });
    expect(() => createCharacterFromJsonTemplate(json, factory)).toThrow(/Invalid targets/);
  });

  it('throws on an unknown effect label', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'SingleTargetDamage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }] }) });
    expect(() => createCharacterFromJsonTemplate(json, factory)).toThrow();
  });
});
