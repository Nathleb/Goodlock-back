import CharacterTemplate from "../types/CharacterTemplate.type";
import EffectFactory from "../factories/EffectFactory.class";
import Die from "../types/Die.type";
import DieFace from "../types/DieFace.type";
import { BaseDieInstructions, EffectEntry } from "../types/BaseDieInstructions.type";
import Character from "../types/Character.type";
import Position from "../types/Position.type";
import { validateEffectTargets } from "./TargetResolution.service";
import { CatalogId } from "@shared/branded.types";

export function createCharacterFromJsonTemplate(jsonCharacterTemplate: string, factory: EffectFactory): Character {
    let template: CharacterTemplate;
    try {
        template = JSON.parse(jsonCharacterTemplate);
    } catch {
        throw new Error("Invalid JSON template");
    }
    return createCharacterFromTemplate(template, factory);
}

export function createCharacterFromTemplate(template: CharacterTemplate, factory: EffectFactory): Character {
    const die = generateFullDie(template.baseDieInstructions, factory);
    return createCharacter({
        catalogId: template.id,
        name: template.name,
        maxHp: template.maxHp,
        baseSpeed: template.baseSpeed,
        baseDie: die,
        position: { playerIndex: 0, slot: 0 },
    });
}

export type CharacterParams = {
    readonly catalogId: CatalogId;
    readonly name: string;
    readonly maxHp: number;
    readonly baseSpeed: number;
    readonly baseDie: Die;
    readonly position: Position;
};

export function createCharacter({ catalogId, name, maxHp, baseSpeed, baseDie, position }: CharacterParams): Character {
    return {
        id: crypto.randomUUID(),
        catalogId,
        name,
        maxHp,
        baseSpeed,
        hp: maxHp,
        baseDie,
        shield: 0,
        modifiers: [],
        face: baseDie[0],
        isFaceLocked: false,
        position,
    };
}

export function setDieFace(character: Character, faceIndex: number, dieFace: DieFace): Character {
    const newBaseDie = [...character.baseDie];
    newBaseDie[faceIndex] = dieFace;
    return { ...character, baseDie: newBaseDie };
}

export function generateFullDie(baseDieInstructions: BaseDieInstructions, factory: EffectFactory): Die {
    return baseDieInstructions.map(faceData =>
        generateFaceFromEffectEntries(
            { description: faceData.description, priority: faceData.priority, effects: [] },
            faceData.effects,
            factory,
        )
    ) as Die;
}

export function generateFaceFromEffectEntries(face: DieFace, effectEntries: readonly EffectEntry[], factory: EffectFactory): DieFace {
    return effectEntries.reduce((acc, entry) => addEffectToFace(acc, entry, factory), face);
}

export function addEffectToFace(dieFace: DieFace, entry: EffectEntry, factory: EffectFactory): DieFace {
    // Template load is a startup boundary: a bad template is a non-recoverable config error.
    const errors = validateEffectTargets(entry.effect, entry.targets ?? []);
    if (errors.length > 0) {
        throw new Error(`Invalid targets for effect "${entry.effect}" on face "${dieFace.description}": ${errors.join('; ')}`);
    }
    const impl = factory.createEffect(entry.effect, entry.magnitude);
    return {
        ...dieFace,
        effects: [...dieFace.effects, { label: entry.effect, magnitude: entry.magnitude, targets: entry.targets, impl }],
    };
}
