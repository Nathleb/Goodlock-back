import DieFace from "../types/DieFace.type";
import Character from "src/types/Character.type";
import Target from "src/types/Target.type";
import { roll1D6 } from "src/utils/Random.utils";


export function rollDie(character: Character): DieFace {
    character.currentFace = character.baseDie[roll1D6()];
    return character.currentFace;
}

export function canRollDie(character: Character): boolean {
    return !character.isFaceLocked;
}

export function rollForTurn(character: Character) {
    if (canRollDie(character)) rollDie(character);
}

export function gainShield(character: Character, amount: number) {
    character.currentShield += amount;
}

export function loseShield(character: Character, amount: number): number {
    const damagesLeftTotake = Math.max(0, amount - character.currentShield);
    character.currentShield = Math.max(character.currentShield - amount, 0);
    return damagesLeftTotake;
}

export function loseHp(character: Character, amount: number) {
    character.currentHp = Math.max(character.currentHp - amount, 0);
}

export function gainHp(character: Character, amount: number) {
    character.currentHp = Math.min(character.currentHp + amount, character.maxHp);
}

export function takeDamage(character: Character, amount: number): boolean {
    const damagesLeftTotake = loseShield(character, amount);
    loseHp(character, damagesLeftTotake);
    return isDead(character);
}

export function resetShield(character: Character) {
    character.currentShield = 0;
}

export function isDead(character: Character): boolean {
    return character.currentHp === 0;
}

export function toggleIsFaceLocked(character: Character) {
    character.isFaceLocked = !character.isFaceLocked;
}

export function setCurrentTarget(character: Character, target: Target) {
    character.currentTarget = target;
}
