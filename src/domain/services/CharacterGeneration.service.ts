import CharacterTemplate from "../types/CharacterTemplate.type";
import EffectFactory from "../factories/EffectFactory.class";
import Die from "../types/Die.type";
import DieFace from "../types/DieFace.type";
import { BaseDieInstructions, EffectEntry } from "../types/BaseDieInstructions.type";
import EffectLabel from "../types/EffectLabels.type";
import Character from "../types/Character.type";
import Position from "../types/Position.type";
import TargetConstraint from "../types/TargetConstraint.type";

export function createCharacterFromJsonTemplate(jsonCharacterTemplate: string): Character {
    let template: CharacterTemplate;
    try {
        template = JSON.parse(jsonCharacterTemplate);
    } catch {
        throw new Error("Invalid JSON template");
    }
    const die = generateFullDie(template.baseDieInstructions);
    return createCharacter(template.name, template.maxHp, template.baseSpeed, die, { playerIndex: 0, slot: 0 });
}

export function createCharacter(name: string, maxHp: number, baseSpeed: number, baseDie: Die, position: Position): Character {
    return {
        id: crypto.randomUUID(),
        name,
        maxHp,
        baseSpeed,
        hp: maxHp,
        baseDie,
        shield: 0,
        modifiers: [],
        face: baseDie[0],
        isFaceLocked: false,
        target: null,
        position,
    };
}

export function setDieFace(character: Character, faceIndex: number, dieFace: DieFace): Character {
    const newBaseDie = [...character.baseDie];
    newBaseDie[faceIndex] = dieFace;
    return { ...character, baseDie: newBaseDie };
}

export function generateFullDie(baseDieInstructions: BaseDieInstructions): Die {
    return baseDieInstructions.map(faceData =>
        generateFaceFromEffectEntries(
            {
                description: faceData.description,
                priority: faceData.priority,
                effects: [],
                targetConstraint: faceData.targetConstraint ?? TargetConstraint.ANY,
            },
            faceData.effects
        )
    ) as Die;
}

export function generateFaceFromEffectEntries(face: DieFace, effectEntries: EffectEntry[]): DieFace {
    return effectEntries.reduce(
        (acc, entry) => addEffectToFace(acc, entry.effect, entry.magnitude),
        face
    );
}

export function addEffectToFace(dieFace: DieFace, effect: EffectLabel, magnitude: number): DieFace {
    return { ...dieFace, effects: [...dieFace.effects, EffectFactory.createEffect(effect, magnitude)] };
}
