import Die from "../types/Die.type";
import DieFace from "../types/DieFace.type";
import Modifier from "../types/Modifier.type";
import Position from "../types/Position.type";

type Character = {
    id: string;
    name: string;
    maxHp: number;
    baseDie: Die;

    hp: number;
    shield: number;
    die: Die;
    position: Position;
    modifiers: Modifier[];

    face: DieFace;
    isFaceLocked: boolean;
    target: Position;
};

export default Character;