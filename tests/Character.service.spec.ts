import { describe } from "node:test";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { rollDie, gainShield, loseShield, loseHp, gainHp, dealDamage, isDead, toggleIsFaceLocked, setTarget } from "@domain/services/Character.service";
import { initializeEffects } from "@domain/services/GameInit.service";

describe('CharacterService', () => {
  const baseDieInstructions: BaseDieInstructions = {
    "0": { description: "Deals 1 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }] },
    "1": { description: "Heals 2 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }] },
    "2": { description: "Grants 3 shield", effects: [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }] },
    "3": { description: "Deals 4 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }] },
    "4": { description: "Heals 5 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }] },
    "5": { description: "Grants 6 shield", effects: [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }] }
  };

  initializeEffects();
  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter("TestCharacter", 100, die, { playerIndex: 0, characterIndex: 0 });

  it('should roll a die for the character', () => {
    const updatedCharacter = rollDie(character);
    expect(updatedCharacter.face).toBeDefined();
  });

  it('should gain shield', () => {
    const updatedCharacter = gainShield(character, 10);
    expect(updatedCharacter.shield).toBe(10);
  });

  it('should lose shield', () => {
    const updatedCharacter = loseShield(character, 5);
    expect(updatedCharacter.shield).toBe(0);
  });

  it('should lose HP', () => {
    const updatedCharacter = loseHp(character, 10);
    expect(updatedCharacter.hp).toBe(90);
  });

  it('should gain HP', () => {
    const updatedCharacter = gainHp(character, 10);
    expect(updatedCharacter.hp).toBe(100);
  });

  it('should deal damage', () => {
    const updatedCharacter = dealDamage(character, 10);
    expect(updatedCharacter.hp).toBe(90);
  });

  it('should check if character is dead', () => {
    const dead = isDead(character);
    expect(dead).toBe(false);
  });

  it('should toggle face lock status', () => {
    const updatedCharacter = toggleIsFaceLocked(character);
    expect(updatedCharacter.isFaceLocked).toBe(true);
  });

  it('should set  target', () => {
    const updatedCharacter = setTarget(character, { playerIndex: 1, characterIndex: 0 });
    expect(updatedCharacter.target).toEqual({ playerIndex: 1, characterIndex: 0 });
  });
});
