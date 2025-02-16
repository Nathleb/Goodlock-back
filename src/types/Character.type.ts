import Die from "src/types/Die.type";
import DieFace from "src/types/DieFace.type";
import Modifier from "./Modifier.type";
import Position from "./Position.type";


type Character = {
    id: string;
    name: string;
    maxHp: number;
    baseDie: Die;

    currentHp: number;
    currentShield: number;
    currentDie: Die;
    currentPosition: Position;
    modifiers: Modifier[];

    currentFace: DieFace;
    isFaceLocked: boolean;
    currentTarget: Position;
};

export default Character;