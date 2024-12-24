import Die from "src/types/Die.type";
import DieFace from "src/types/DieFace.type";
import Modifier from "./Modifier.type";
import Position from "./Position.type";
import Location from "./Location.type";


type Character = {
    name: string;
    maxHp: number;
    baseDie: Die;

    currentHp: number;
    currentShield: number;
    currentDie: Die;
    modifiers: Modifier[];

    currentFace: DieFace;
    isFaceLocked: boolean;
    currentTarget: Location;
};

export default Character;