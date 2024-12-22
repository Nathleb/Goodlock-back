import { TargetType } from "src/strategies/TargetType.type";
import Character from "./Character.type";

type Effect = {
    priority: number;
    type: TargetType;

    solve(targetedCharacter?: Character | Character[]): void;
};

export default Effect;