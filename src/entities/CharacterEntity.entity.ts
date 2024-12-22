import { BaseDieInstructions } from "../types/BaseDieInstructions.type";

export default class CharacterEntity {
    name: string;
    maxHp: number;
    baseDieInstructions: BaseDieInstructions;

    constructor(name: string, maxHp: number, baseDieInstructions: BaseDieInstructions) {
        this.name = name;
        this.maxHp = maxHp;
        this.baseDieInstructions = baseDieInstructions;
    }
}