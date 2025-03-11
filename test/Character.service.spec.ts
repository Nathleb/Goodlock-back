import { describe } from "node:test";
import { rollDie, gainShield, loseShield, loseHp, gainHp, dealDamage, isDead, toggleIsFaceLocked, setCurrentTarget } from "../src/services/Character.service";
import { createCharacter, generateFullDie } from "../src/services/CharacterGeneration.service";
import { BaseDieInstructions } from "../src/types/BaseDieInstructions.type";

describe('CharacterService', () => {
  const baseDieInstructions: BaseDieInstructions = {
    "0": [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }],
    "1": [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }],
    "2": [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }],
    "3": [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }],
    "4": [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }],
    "5": [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }]
  };

  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter("TestCharacter", 100, die, { playerIndex: 0, characterIndex: 0 });

  it('should roll a die for the character', () => {
    const updatedCharacter = rollDie(character);
    expect(updatedCharacter.currentFace).toBeDefined();
  });

  it('should gain shield', () => {
    const updatedCharacter = gainShield(character, 10);
    expect(updatedCharacter.currentShield).toBe(10);
  });

  it('should lose shield', () => {
    const updatedCharacter = loseShield(character, 5);
    expect(updatedCharacter.currentShield).toBe(0);
  });

  it('should lose HP', () => {
    const updatedCharacter = loseHp(character, 10);
    expect(updatedCharacter.currentHp).toBe(90);
  });

  it('should gain HP', () => {
    const updatedCharacter = gainHp(character, 10);
    expect(updatedCharacter.currentHp).toBe(100);
  });

  it('should deal damage', () => {
    const updatedCharacter = dealDamage(character, 10);
    expect(updatedCharacter.currentHp).toBe(90);
  });

  it('should check if character is dead', () => {
    const dead = isDead(character);
    expect(dead).toBe(false);
  });

  it('should toggle face lock status', () => {
    const updatedCharacter = toggleIsFaceLocked(character);
    expect(updatedCharacter.isFaceLocked).toBe(true);
  });

  it('should set current target', () => {
    const updatedCharacter = setCurrentTarget(character, { playerIndex: 1, characterIndex: 0 });
    expect(updatedCharacter.currentTarget).toEqual({ playerIndex: 1, characterIndex: 0 });
  });
});
