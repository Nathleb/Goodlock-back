import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, createCharacterFromJsonTemplate, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { buildEffectFactory } from "@domain/services/GameInit.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import TargetConstraint from "@domain/types/TargetConstraint.type";

describe('CharacterGenerationService', () => {
  const factory = buildEffectFactory();

  const jsonTemplate = JSON.stringify({
    name: "TestCharacter",
    maxHp: 100,
    baseSpeed: 5,
    baseDieInstructions: [
      { description: "Deals 1 damage", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
      { description: "Heals 2 HP", priority: 1, effects: [{ effect: EffectLabel.SingleTargetHeal, magnitude: 2 }] },
      { description: "Grants 3 shield", priority: 1, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 3 }] },
      { description: "Deals 4 damage", priority: 2, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 4 }] },
      { description: "Heals 5 HP", priority: 2, effects: [{ effect: EffectLabel.SingleTargetHeal, magnitude: 5 }] },
      { description: "Grants 6 shield", priority: 2, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 6 }] },
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

  it('defaults targetConstraint to ANY when not specified in template', () => {
    const instructions: BaseDieInstructions = [
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
    ];
    const die = generateFullDie(instructions, factory);
    expect(die[0].targetConstraint).toBe(TargetConstraint.ANY);
  });

  it('preserves explicit targetConstraint from template', () => {
    const instructions: BaseDieInstructions = [
        { description: 'f', priority: 1, effects: [], targetConstraint: TargetConstraint.ALLY_ONLY },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
    ];
    const die = generateFullDie(instructions, factory);
    expect(die[0].targetConstraint).toBe(TargetConstraint.ALLY_ONLY);
    expect(die[1].targetConstraint).toBe(TargetConstraint.ANY);
  });
});
