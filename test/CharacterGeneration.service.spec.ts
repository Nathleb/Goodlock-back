import { createCharacterFromJsonTemplate, createCharacter, generateFullDie } from "../src/services/CharacterGeneration.service";
import { BaseDieInstructions } from "../src/types/BaseDieInstructions.type";

describe('CharacterGenerationService', () => {
  const jsonTemplate = JSON.stringify({
    name: "TestCharacter",
    maxHp: 100,
    baseDieInstructions: {
      "0": [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }],
      "1": [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }],
      "2": [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }],
      "3": [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }],
      "4": [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }],
      "5": [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }]
    }
  });

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
