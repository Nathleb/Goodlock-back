import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel, allyRel } from "./helpers/targets";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { rollDie, gainShield, loseShield, loseHp, gainHp, dealDamage, isDead } from "@domain/services/Character.service";
import { ScriptedDiceSource } from '@infrastructure/adapters/dice/ScriptedDiceSource';

const dice = ScriptedDiceSource.always(0);

describe('CharacterService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
    { description: "Heals 2 HP", priority: 1, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Heal, magnitude: 2 }] }] },
    { description: "Grants 3 shield", priority: 1, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Shield, magnitude: 3 }] }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 4 }] }] },
    { description: "Heals 5 HP", priority: 2, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Heal, magnitude: 5 }] }] },
    { description: "Grants 6 shield", priority: 2, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Shield, magnitude: 6 }] }] },
  ];

  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: "TestCharacter", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });

  it('should roll a die for the character', () => {
    const updatedCharacter = rollDie(character, dice);
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

  it('DEAD-1: heals a character at 0 HP that is still on the board', () => {
    const atZero = loseHp(character, character.hp);
    const healed = gainHp(atZero, 50);
    expect(healed.hp).toBe(50);
  });

  it('should deal damage', () => {
    const updatedCharacter = dealDamage(character, 10);
    expect(updatedCharacter.hp).toBe(90);
  });

  it('should check if character is dead', () => {
    expect(isDead(character)).toBe(false);
  });
});
