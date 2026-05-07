import Character from "../types/Character.type";
import { roll1D6 } from "../utils/Random.utils";
import Position from "../types/Position.type";

const updateCharacter = (character: Character, updates: Partial<Character>): Character => ({
    ...character,
    ...updates,
});

export function rollDie(character: Character): Character {
    return updateCharacter(character, { face: character.baseDie[roll1D6()] });
}

export function canRollDie(character: Character): boolean {
    return !character.isFaceLocked;
}

export function rollForTurn(character: Character): Character {
    return canRollDie(character) ? rollDie(character) : character;
}

export function gainShield(character: Character, amount: number): Character {
    return updateCharacter(character, { shield: character.shield + amount });
}

export function loseShield(character: Character, amount: number): Character {
    return updateCharacter(character, { shield: Math.max(0, character.shield - amount) });
}

export function loseHp(character: Character, amount: number): Character {
    return updateCharacter(character, { hp: Math.max(character.hp - amount, 0) });
}

export function gainHp(character: Character, amount: number): Character {
    return updateCharacter(character, { hp: Math.min(character.hp + amount, character.maxHp) });
}

export function dealDamage(character: Character, amount: number): Character {
    const shieldAbsorption = Math.min(character.shield, amount);
    const afterShield = loseShield(character, shieldAbsorption);
    const remainingDamage = amount - shieldAbsorption;
    return remainingDamage > 0 ? loseHp(afterShield, remainingDamage) : afterShield;
}

export function resetShield(character: Character): Character {
    return updateCharacter(character, { shield: 0 });
}

export function isDead(character: Character): boolean {
    return character.hp === 0;
}

export function toggleIsFaceLocked(character: Character): Character {
    return updateCharacter(character, { isFaceLocked: !character.isFaceLocked });
}

export function setTarget(character: Character, position: Position): Character {
    return updateCharacter(character, { target: position });
}
