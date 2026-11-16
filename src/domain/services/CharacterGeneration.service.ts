import CharacterTemplate from "../types/CharacterTemplate.type";
import EffectLabel from "../types/EffectLabels.type";
import { effectFor } from "../strategies/effectFor";
import Die from "../types/Die.type";
import DieFace, { FacePart } from "../types/DieFace.type";
import { BaseDieInstructions, EffectEntry, PartEntry } from "../types/BaseDieInstructions.type";
import Character from "../types/Character.type";
import Position from "../types/Position.type";
import { validateEffectTargets, validateStatParams, validateStateParams } from "./TargetResolution.service";
import { CatalogId, CharacterId } from "@shared/branded.types";

export function createCharacterFromTemplate(template: CharacterTemplate): Character {
    const die = generateFullDie(template.baseDieInstructions);
    return createCharacter({
        catalogId: template.id,
        name: template.name,
        maxHp: template.maxHp,
        baseSpeed: template.baseSpeed,
        baseDie: die,
        position: { playerIndex: 0, slot: 0 },
    });
}

type CharacterParams = {
    readonly catalogId: CatalogId;
    readonly name: string;
    readonly maxHp: number;
    readonly baseSpeed: number;
    readonly baseDie: Die;
    readonly position: Position;
};

export function createCharacter({ catalogId, name, maxHp, baseSpeed, baseDie, position }: CharacterParams): Character {
    return {
        id: crypto.randomUUID() as CharacterId,
        catalogId,
        name,
        maxHp,
        baseSpeed,
        hp: maxHp,
        baseDie,
        shield: 0,
        modifiers: [],
        states: {},
        face: baseDie[0],
        isFaceLocked: false,
        keptAtLastRoll: false,
        position,
    };
}

export function generateFullDie(baseDieInstructions: BaseDieInstructions): Die {
    return baseDieInstructions.map(faceData =>
        generateFaceFromEffectEntries(
            { description: faceData.description, priority: faceData.priority, effects: [] },
            faceData.effects,
        )
    ) as Die;
}

function generateFaceFromEffectEntries(face: DieFace, effectEntries: readonly EffectEntry[]): DieFace {
    return effectEntries.reduce((acc, entry) => addEffectToFace(acc, entry), face);
}

function addEffectToFace(dieFace: DieFace, entry: EffectEntry): DieFace {
    // Template load is a startup boundary: a bad template is a non-recoverable config error.
    const parts = entry.parts ?? [];
    if (parts.length === 0) {
        throw new Error(`Invalid effect on face "${dieFace.description}": an effect needs at least one part`);
    }
    const name = parts.map(p => p.part).join('+');
    const swaps = parts.some(p => p.part === EffectLabel.Swap);
    const errors = validateEffectTargets(swaps ? EffectLabel.Swap : name, entry.targets ?? []);
    if (errors.length > 0) {
        throw new Error(`Invalid targets for effect "${name}" on face "${dieFace.description}": ${errors.join('; ')}`);
    }
    const effect = { targets: entry.targets, parts: parts.map(p => buildPart(dieFace.description, p)) };
    return { ...dieFace, effects: [...dieFace.effects, effect] };
}

function partParamErrors(entry: PartEntry): { kind: string; errors: string[] } {
    if (entry.part === EffectLabel.ApplyStat) return { kind: 'stat', errors: validateStatParams(entry) };
    if (entry.part === EffectLabel.ApplyState) return { kind: 'state', errors: validateStateParams(entry) };
    return { kind: '', errors: [] };
}

function buildPart(faceDescription: string, entry: PartEntry): FacePart {
    const { kind, errors } = partParamErrors(entry);
    if (errors.length > 0) {
        throw new Error(`Invalid ${kind} parameters for effect "${entry.part}" on face "${faceDescription}": ${errors.join('; ')}`);
    }
    const params = entry.part === EffectLabel.ApplyStat ? { stat: entry.stat, duration: entry.duration }
        : entry.part === EffectLabel.ApplyState ? { state: entry.state, duration: entry.duration }
        : undefined;
    // A state has no magnitude: the part carries 0.
    const magnitude = entry.part === EffectLabel.ApplyState ? 0 : entry.magnitude;
    const part: FacePart = { label: entry.part, magnitude, ...params };
    // The validators above already reject missing parameters; this call is what rejects an
    // unknown part label at catalog load instead of mid-match. Do not remove it.
    effectFor(part);
    return part;
}
