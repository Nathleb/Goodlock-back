import DieFace from "../types/DieFace.type";
import Character from "src/types/Character.type";
import Location from "src/types/Coordinate";
import { roll1D6 } from "src/utils/Random.utils";

const updateCharacter = (character: Character, updates: Partial<Character>): Character => ({
    ...character,
    ...updates,
});

export function rollDie(character: Character): { character: Character; face: DieFace; } {
    const newFace = character.baseDie[roll1D6()];
    const updatedCharacter = updateCharacter(character, { currentFace: newFace });
    return { character: updatedCharacter, face: newFace };
}

export function canRollDie(character: Character): boolean {
    return !character.isFaceLocked;
}

export function rollForTurn(character: Character): Character {
    if (canRollDie(character)) {
        const { character: updatedCharacter } = rollDie(character);
        return updatedCharacter;
    }
    return character;
}

export function gainShield(character: Character, amount: number): Character {
    return updateCharacter(character, { currentShield: character.currentShield + amount });
}

export function loseShield(character: Character, amount: number): Character {
    return updateCharacter(character, { currentShield: Math.max(0, character.currentShield - amount) });
}

export function loseHp(character: Character, amount: number): Character {
    return updateCharacter(character, { currentHp: Math.max(character.currentHp - amount, 0) });
}

export function gainHp(character: Character, amount: number): Character {
    return updateCharacter(character, { currentHp: Math.min(character.currentHp + amount, character.maxHp) });
}

export function dealDamage(character: Character, amount: number): Character {
    let damageTaken = amount;
    let updatedCharacter = character;

    if (character.currentShield > 0) {
        const shieldAbsorption = Math.min(character.currentShield, amount);
        updatedCharacter = loseShield(updatedCharacter, shieldAbsorption);
        damageTaken -= shieldAbsorption;
    }

    if (damageTaken > 0) {
        updatedCharacter = loseHp(updatedCharacter, damageTaken);
    }

    return updatedCharacter;
}

export function resetShield(character: Character): Character {
    return updateCharacter(character, { currentShield: 0 });
}

export function isDead(character: Character): boolean {
    return character.currentHp === 0;
}

export function toggleIsFaceLocked(character: Character): Character {
    return updateCharacter(character, { isFaceLocked: !character.isFaceLocked });
}

export function setCurrentTarget(character: Character, target: Location): Character {
    return updateCharacter(character, { currentTarget: target });
}