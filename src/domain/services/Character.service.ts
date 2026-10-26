import Character from "../types/Character.type";
import { StatName } from "../types/Modifier.type";
import { StateAxis } from "../types/State.type";
import { roll1D6 } from "../utils/Random.utils";

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
    if (isDead(character)) return character;
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

/** The net value of a stat never goes beyond +/- this. To revisit after the balancing simulations. */
export const MAX_STAT_NET = 9;

/** Net value of a stat: the sum of its active instances, capped when read (instances stay uncapped, so opposites still cancel). */
export function netStat(character: Character, stat: StatName): number {
    const sum = character.modifiers
        .filter(m => m.stat === stat)
        .reduce((total, m) => total + m.value, 0);
    return Math.max(-MAX_STAT_NET, Math.min(MAX_STAT_NET, sum));
}

/**
 * End of round: every stat instance loses one round and is removed at 0, except
 * one applied during the ending round, which only starts ticking next round.
 */
export function tickModifiers(character: Character, endingRound: number): Character {
    const ticked = character.modifiers
        .map(m => m.appliedRound === endingRound ? m : { ...m, roundsLeft: m.roundsLeft - 1 })
        .filter(m => m.roundsLeft > 0);
    return updateCharacter(character, { modifiers: ticked });
}

/** Signed counter of a state axis (0 when the axis is absent). */
export function stateValue(character: Character, axis: StateAxis): number {
    return character.states[axis]?.value ?? 0;
}

/**
 * End of round: every state axis moves one step toward 0 and is dropped at 0,
 * except an axis touched during the ending round, which starts ticking next round.
 */
export function tickStates(character: Character, endingRound: number): Character {
    const ticked: Record<string, { value: number; touchedRound: number }> = {};
    for (const [axis, counter] of Object.entries(character.states)) {
        if (!counter) continue;
        const value = counter.touchedRound === endingRound ? counter.value : counter.value - Math.sign(counter.value);
        if (value !== 0) ticked[axis] = { ...counter, value };
    }
    return updateCharacter(character, { states: ticked });
}
