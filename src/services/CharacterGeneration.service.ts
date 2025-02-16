import CharacterEntity from "src/entities/CharacterEntity.entity";
import EffectFactory from "./../factories/EffectFactory";
import Die from "src/types/Die.type";
import DieFace from "src/types/DieFace.type";
import { BaseDieInstructions, EffectEntry } from "src/types/BaseDieInstructions.type";
import Face from "src/types/Face.type";
import EffectLabels from "src/types/EffectLabels.type";
import Character from "src/types/Character.type";
import Position from "src/types/Position.type";

/**
 * Creates a character from a JSON template.
 * @param jsonCharacterTemplate - The JSON string representing the character template.
 * @returns A new character object.
 */
export function createCharacterFromJsonTemplate(jsonCharacterTemplate: string): Character {
    let characterTemplateObject: CharacterEntity;
    try {
        characterTemplateObject = JSON.parse(jsonCharacterTemplate);
    } catch (error) {
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
 * @param playerId - The ID of the player owning the character.
 * @param currentPosition - The current position of the character.
 * @returns A new character object.
 */
export function createCharacter(name: string, maxHp: number, baseDie: Die, currentPosition: Position): Character {
    return {
        id: crypto.randomUUID(),
        name: name,
        maxHp: maxHp,
        currentHp: maxHp,
        baseDie: baseDie,
        currentDie: baseDie,
        currentShield: 0,
        modifiers: [],
        currentFace: baseDie[0],
        isFaceLocked: false,
        currentTarget: null,
        currentPosition
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
        effectEntries = effectEntries as EffectEntry[];
        die[faceIndex] = generateFaceFromEffectEntries([], effectEntries);
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
    dieFace.push(EffectFactory.createEffect(effect, magnitude, priority));
}
