import Die from "./Die.type";
import DieFace from "./DieFace.type";
import Modifier from "./Modifier.type";
import Position from "./Position.type";
import { CatalogId } from "@shared/branded.types";

type Character = {
    readonly id: string;
    readonly catalogId: CatalogId;
    readonly name: string;
    readonly maxHp: number;
    readonly baseSpeed: number;
    readonly baseDie: Die;

    readonly hp: number;
    readonly shield: number;
    readonly position: Position;
    readonly modifiers: readonly Modifier[];

    readonly face: DieFace;
    readonly isFaceLocked: boolean;
};

export default Character;
