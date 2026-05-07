import Die from "./Die.type";
import DieFace from "./DieFace.type";
import Modifier from "./Modifier.type";
import Position from "./Position.type";

type Character = {
    id: string;
    name: string;
    maxHp: number;
    baseSpeed: number;
    baseDie: Die;

    hp: number;
    shield: number;
    position: Position;
    modifiers: Modifier[];

    face: DieFace;
    isFaceLocked: boolean;
    target: Position | null;
};

export default Character;
