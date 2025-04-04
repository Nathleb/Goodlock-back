import CharacterEntity from "../entities/CharacterEntity.entity";
import EffectFactory from "../factories/EffectFactory";
import Die from "../types/Die.type";
import DieFace from "../types/DieFace.type";
import { BaseDieInstructions, EffectEntry } from "../types/BaseDieInstructions.type";
import Face from "../types/Face.type";
import EffectLabels from "../types/EffectLabels.type";
import Character from "../types/Character.type";
import Position from "../types/Position.type";

/**
 * Creates a character from a JSON template.
 * @param jsonCharacterTemplate - The JSON string representing the character template.
 * @returns A new character object.
 */
export function createCharacterFromJsonTemplate(jsonCharacterTemplate: string): Character {
    let characterTemplateObject: CharacterEntity;
    try {
        characterTemplateObject = JSON.parse(jsonCharacterTemplate);
    } catch {
        throw new Error("Invalid JSON template");
    }
    const die = generateFullDie(characterTemplateObject.baseDieInstructions);
    return createCharacter(characterTemplateObject.name, characterTemplateObject.maxHp, die, { playerIndex: 0, characterIndex: 0 });
}

/**
 * Creates a character with the specified attributes.
 * @param name - The name of the character.
 * @param maxHp - The maximum HP of the character.
 * @param baseDie - The base die of the character.
 * @param position - The position of the character.
 * @returns A new character object.
 */
export function createCharacter(name: string, maxHp: number, baseDie: Die, position: Position): Character {
    const die = baseDie.map(face => ({ ...face }));

    return {
        id: crypto.randomUUID(),
        name: name,
        maxHp: maxHp,
        hp: maxHp,
        baseDie: baseDie,
        die: die,
        shield: 0,
        modifiers: [],
        face: die[0],
        isFaceLocked: false,
        target: null,
        position
    };
}

/**
 * Sets a die face for the character.
 * @param character - The character whose die face is to be set.
 * @param face - The face index to set.
 * @param dieFace - The die face to set.
 */
export function setDieFace(character: Character, face: Face, dieFace: DieFace): Character {
    const newBaseDie = [...character.baseDie];
    newBaseDie[face] = dieFace;
    return { ...character, baseDie: newBaseDie };
}

/**
 * Generates a full die from base die instructions.
 * @param baseDieInstructions - The instructions for generating the base die.
 * @returns A new die.
 */
export function generateFullDie(baseDieInstructions: BaseDieInstructions): Die {
    const die: Die = [];

    Object.entries(baseDieInstructions).forEach(([face, effectEntries]) => {
        const faceIndex = Number(face);
        die[faceIndex] = generateFaceFromEffectEntries({ description: effectEntries.description, effects: [] }, effectEntries.effects);
    });

    return die;
}

/**
 * Generates a die face from effect entries.
 * @param face - The die face to add effects to.
 * @param effectEntries - The effect entries to add to the die face.
 * @returns A new die face.
 */
export function generateFaceFromEffectEntries(face: DieFace, effectEntries: EffectEntry[]): DieFace {
    effectEntries.forEach(effectEntry => {
        addEffectToFace(face, effectEntry.effect, effectEntry.magnitude, effectEntry.priority);
    });
    return face;
}

/**
 * Adds an effect to a die face.
 * @param dieFace - The die face to add the effect to.
 * @param effect - The effect to add.
 * @param magnitude - The magnitude of the effect.
 * @param priority - The priority of the effect.
 */
export function addEffectToFace(dieFace: DieFace, effect: EffectLabels, magnitude: number, priority: number = 1): void {
    dieFace.effects.push(EffectFactory.createEffect(effect, magnitude, priority));
}
