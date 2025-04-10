import { createCharacter, createCharacterFromJsonTemplate, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { initializeEffects } from "@domain/services/GameInit.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

describe('CharacterGenerationService', () => {
  const jsonTemplate = JSON.stringify({
    name: "TestCharacter",
    maxHp: 100,
    baseDieInstructions: {
      "0": { description: "Deals 1 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }] },
      "1": { description: "Heals 2 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }] },
      "2": { description: "Grants 3 shield", effects: [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }] },
      "3": { description: "Deals 4 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }] },
      "4": { description: "Heals 5 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }] },
      "5": { description: "Grants 6 shield", effects: [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }] }
    }
  });

  initializeEffects();

  it('should create a character from JSON template', () => {
    const character = createCharacterFromJsonTemplate(jsonTemplate);
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
  });

  it('should create a character with specified attributes', () => {
    const die = generateFullDie(JSON.parse(jsonTemplate).baseDieInstructions as BaseDieInstructions);
    const character = createCharacter("TestCharacter", 100, die, { playerIndex: 0, characterIndex: 0 });
    expect(character.name).toBe("TestCharacter");
    expect(character.maxHp).toBe(100);
  });
});
