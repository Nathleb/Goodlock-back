import { BaseDieInstructions } from "./BaseDieInstructions.type";

type CharacterTemplate = {
    name: string;
    maxHp: number;
    baseSpeed: number;
    baseDieInstructions: BaseDieInstructions;
};

export default CharacterTemplate;
