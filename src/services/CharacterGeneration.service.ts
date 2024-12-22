import CharacterEntity from "src/entities/CharacterEntity.entity";
import EffectFactory from "./../factories/EffectFactory";
import Die from "src/types/Die.type";
import DieFace from "src/types/DieFace.type";
import { BaseDieInstructions, EffectEntry } from "src/types/BaseDieInstructions.type";
import Face from "src/types/Face.type";
import EffectLabels from "src/types/EffectLabels.type";
import Character from "src/types/Character.type";

export function createCharacterFromJsonTemplate(jsonCharacterTemplate: string): Character {
    const characterTemplateObject: CharacterEntity = JSON.parse(jsonCharacterTemplate);
    const die = generateFullDie(characterTemplateObject.baseDieInstructions);

    return createCharacter(characterTemplateObject.name, characterTemplateObject.maxHp, die);
}

export function createCharacter(name: string, maxHp: number, baseDie: Die): Character {
    return {
        name: name,
        maxHp: maxHp,
        currentHp: maxHp,
        baseDie: baseDie,
        currentDie: baseDie,
        currentShield: 0,
        modifiers: [],
        currentFace: baseDie[0],
        isFaceLocked: false,
        currentTarget: null
    };
}

export function setDieFace(character: Character, face: Face, dieFace: DieFace): void {
    character.baseDie[face] = dieFace;
}

export function generateFullDie(baseDieInstructions: BaseDieInstructions): Die {
    const die = [];

    Object.entries(baseDieInstructions).forEach(([face, effectEntries]) => {
        const faceIndex = Number(face);
        effectEntries = effectEntries as EffectEntry[];
        die[faceIndex] = generateFaceFromEffectEntries(die[faceIndex], effectEntries);
    });

    return die;
}

export function generateFaceFromEffectEntries(face: DieFace, effectEntries: EffectEntry[]): DieFace {
    effectEntries.forEach(effectEntry => {
        addEffectToFace(face, effectEntry.effect, effectEntry.magnitude, effectEntry.priority);
    });
    return face;
}

export function addEffectToFace(dieFace: DieFace, effect: EffectLabels, magnitude: number, priority: number): void {
    dieFace.push(EffectFactory.createEffect(effect, magnitude, priority));
}
