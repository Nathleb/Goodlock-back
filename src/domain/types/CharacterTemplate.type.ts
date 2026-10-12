import { BaseDieInstructions } from "./BaseDieInstructions.type";
import { CatalogId } from "@shared/branded.types";

type CharacterTemplate = {
    readonly id: CatalogId;
    readonly name: string;
    readonly maxHp: number;
    readonly baseSpeed: number;
    readonly baseDieInstructions: BaseDieInstructions;
};

export default CharacterTemplate;
