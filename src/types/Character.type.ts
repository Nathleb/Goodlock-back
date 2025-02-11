import Die from "src/types/Die.type";
import DieFace from "src/types/DieFace.type";
import Modifier from "./Modifier.type";
import Position from "./Position.type";


type Character = {
    name: string;
    maxHp: number;
    baseDie: Die;

    currentHp: number;
    currentShield: number;
    currentDie: Die;
    playerId: 0 | 1;
    currentPosition: Position;
    modifiers: Modifier[];

    currentFace: DieFace;
    isFaceLocked: boolean;
    currentTarget: Position;
};

export default Character;