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
    /** The die is kept: the next Roll leaves it alone. Set when its owner confirms a Keep, cleared at the end of the round. */
    readonly isFaceLocked: boolean;
    /** Whether the die was kept at the last Roll (ROLL-2): what the opponent may see of it during a Keep (GAME-9). */
    readonly keptAtLastRoll: boolean;
};

export default Character;
