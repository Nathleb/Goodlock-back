import Character from "src/types/Character.type";
import { roll1D6 } from "src/utils/Random.utils";
import Position from "src/types/Position.type";

const updateCharacter = (character: Character, updates: Partial<Character>): Character => ({
    ...character,
    ...updates,
});

/**
 * Rolls a die for the character and updates its face.
 * @param character - The character whose die is to be rolled.
 * @returns A new character object with the updated face.
 */
export function rollDie(character: Character): Character {
    const newFace = character.baseDie[roll1D6()];
    const updatedCharacter = updateCharacter(character, { face: newFace });
    return updatedCharacter;
}

/**
 * Checks if the character can roll a die.
 * @param character - The character to check.
 * @returns True if the character can roll a die, otherwise false.
 */
export function canRollDie(character: Character): boolean {
    return !character.isFaceLocked;
}

/**
 * Rolls a die for the character if it can roll.
 * @param character - The character whose die is to be rolled.
 * @returns A new character object with the updated face if it can roll, otherwise the original character.
 */
export function rollForTurn(character: Character): Character {
    if (canRollDie(character)) {
        return rollDie(character);
    }
    return character;
}

/**
 * Increases the character's shield by a specified amount.
 * @param character - The character whose shield is to be increased.
 * @param amount - The amount to increase the shield by.
 * @returns A new character object with the updated shield.
 */
export function gainShield(character: Character, amount: number): Character {
    return updateCharacter(character, { shield: character.shield + amount });
}

/**
 * Decreases the character's shield by a specified amount.
 * @param character - The character whose shield is to be decreased.
 * @param amount - The amount to decrease the shield by.
 * @returns A new character object with the updated shield.
 */
export function loseShield(character: Character, amount: number): Character {
    return updateCharacter(character, { shield: Math.max(0, character.shield - amount) });
}

/**
 * Decreases the character's HP by a specified amount.
 * @param character - The character whose HP is to be decreased.
 * @param amount - The amount to decrease the HP by.
 * @returns A new character object with the updated HP.
 */
export function loseHp(character: Character, amount: number): Character {
    return updateCharacter(character, { hp: Math.max(character.hp - amount, 0) });
}

/**
 * Increases the character's HP by a specified amount.
 * @param character - The character whose HP is to be increased.
 * @param amount - The amount to increase the HP by.
 * @returns A new character object with the updated HP.
 */
export function gainHp(character: Character, amount: number): Character {
    return updateCharacter(character, { hp: Math.min(character.hp + amount, character.maxHp) });
}

/**
 * Deals damage to the character, reducing its shield and HP accordingly.
 * @param character - The character to deal damage to.
 * @param amount - The amount of damage to deal.
 * @returns A new character object with the updated shield and HP.
 */
export function dealDamage(character: Character, amount: number): Character {
    let damageTaken = amount;
    let updatedCharacter = character;

    if (character.shield > 0) {
        const shieldAbsorption = Math.min(character.shield, amount);
        updatedCharacter = loseShield(updatedCharacter, shieldAbsorption);
        damageTaken -= shieldAbsorption;
    }

    if (damageTaken > 0) {
        updatedCharacter = loseHp(updatedCharacter, damageTaken);
    }
    console.log(`${character.name} took ${amount} damage! ${updatedCharacter.hp}`);

    return updatedCharacter;
}

/**
 * Resets the character's shield to 0.
 * @param character - The character whose shield is to be reset.
 * @returns A new character object with the updated shield.
 */
export function resetShield(character: Character): Character {
    return updateCharacter(character, { shield: 0 });
}

/**
 * Checks if the character is dead.
 * @param character - The character to check.
 * @returns True if the character's HP is 0, otherwise false.
 */
export function isDead(character: Character): boolean {
    return character.hp === 0;
}

/**
 * Toggles the face lock status of the character.
 * @param character - The character whose face lock status is to be toggled.
 * @returns A new character object with the updated face lock status.
 */
export function toggleIsFaceLocked(character: Character): Character {
    return updateCharacter(character, { isFaceLocked: !character.isFaceLocked });
}

/**
 * Sets the target of the character.
 * @param character - The character whose target is to be set.
 * @param position - The position to set as the target.
 * @returns A new character object with the updated target.
 */
export function setTarget(character: Character, position: Position): Character {
    return updateCharacter(character, { target: position });
}