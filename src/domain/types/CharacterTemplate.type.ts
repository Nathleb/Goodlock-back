import { BaseDieInstructions } from "./BaseDieInstructions.type";

type CharacterTemplate = {
    readonly name: string;
    readonly maxHp: number;
    readonly baseSpeed: number;
    readonly baseDieInstructions: BaseDieInstructions;
};

export default CharacterTemplate;
