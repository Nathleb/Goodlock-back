import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, createCharacterFromJsonTemplate, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { buildEffectFactory } from "@domain/services/GameInit.service";

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
    const character = createCharacter("TestCharacter", 100, 5, die, { playerIndex: 0, slot: 0 });
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
    expect(character.baseSpeed).toBe(5);
  });

  it('carries label, magnitude and targets on each face effect', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'Damage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }] }] }) });
    const c = createCharacterFromJsonTemplate(json, factory);
    expect(c.baseDie[0].effects[0]).toMatchObject({
      label: 'Damage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }],
    });
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
