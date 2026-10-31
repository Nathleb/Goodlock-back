import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel, allyRel } from "./helpers/targets";
import { describe } from "node:test";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { rollDie, gainShield, loseShield, loseHp, gainHp, dealDamage, isDead, toggleIsFaceLocked } from "@domain/services/Character.service";

describe('CharacterService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "Heals 2 HP", priority: 1, effects: [{ effect: EffectLabel.Heal, magnitude: 2, targets: [allyRel(0)] }] },
    { description: "Grants 3 shield", priority: 1, effects: [{ effect: EffectLabel.Shield, magnitude: 3, targets: [allyRel(0)] }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: EffectLabel.Damage, magnitude: 4, targets: [enemyRel(0)] }] },
    { description: "Heals 5 HP", priority: 2, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Grants 6 shield", priority: 2, effects: [{ effect: EffectLabel.Shield, magnitude: 6, targets: [allyRel(0)] }] },
  ];

  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: "TestCharacter", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });

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

  it('should not heal a dead character', () => {
    const dead = loseHp(character, character.hp);
    const healed = gainHp(dead, 50);
    expect(healed.hp).toBe(0);
  });

  it('should deal damage', () => {
    const updatedCharacter = dealDamage(character, 10);
    expect(updatedCharacter.hp).toBe(90);
  });

  it('should check if character is dead', () => {
    expect(isDead(character)).toBe(false);
  });

  it('should toggle face lock status', () => {
    const updatedCharacter = toggleIsFaceLocked(character);
    expect(updatedCharacter.isFaceLocked).toBe(true);
  });
});
