import { createCharacter, createCharacterFromJsonTemplate, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { initializeEffects } from "@domain/services/GameInit.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

describe('CharacterGenerationService', () => {
  const jsonTemplate = JSON.stringify({
    name: "TestCharacter",
    maxHp: 100,
    baseSpeed: 5,
    baseDieInstructions: [
      { description: "Deals 1 damage", priority: 1, effects: [{ effect: "SingleTargetDamage", magnitude: 1 }] },
      { description: "Heals 2 HP", priority: 1, effects: [{ effect: "SingleTargetHeal", magnitude: 2 }] },
      { description: "Grants 3 shield", priority: 1, effects: [{ effect: "SingleTargetShield", magnitude: 3 }] },
      { description: "Deals 4 damage", priority: 2, effects: [{ effect: "SingleTargetDamage", magnitude: 4 }] },
      { description: "Heals 5 HP", priority: 2, effects: [{ effect: "SingleTargetHeal", magnitude: 5 }] },
      { description: "Grants 6 shield", priority: 2, effects: [{ effect: "SingleTargetShield", magnitude: 6 }] },
    ],
  });

  initializeEffects();

  it('should create a character from JSON template', () => {
    const character = createCharacterFromJsonTemplate(jsonTemplate);
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
    expect(character.baseSpeed).toBe(5);
  });

  it('should create a character with specified attributes', () => {
    const die = generateFullDie(JSON.parse(jsonTemplate).baseDieInstructions);
    const character = createCharacter("TestCharacter", 100, 5, die, { playerIndex: 0, slot: 0 });
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
    expect(character.baseSpeed).toBe(5);
  });
});
