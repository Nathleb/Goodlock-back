import Die from "./Die.type";
import DieFace from "./DieFace.type";
import Modifier from "./Modifier.type";
import Position from "./Position.type";
import { CharacterStates } from "./State.type";
import { CatalogId, CharacterId } from "@shared/branded.types";

type Character = {
    readonly id: CharacterId;
    readonly catalogId: CatalogId;
    readonly name: string;
    readonly maxHp: number;
    readonly baseSpeed: number;
    readonly baseDie: Die;

    readonly hp: number;
    readonly shield: number;
    readonly position: Position;
    readonly modifiers: readonly Modifier[];
    readonly states: CharacterStates;

    readonly face: DieFace;
    readonly isFaceLocked: boolean;
};

export default Character;
