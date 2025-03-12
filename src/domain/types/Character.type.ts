import Die from "src/types/Die.type";
import DieFace from "src/types/DieFace.type";
import Modifier from "./Modifier.type";
import Position from "./Position.type";

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