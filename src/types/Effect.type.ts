import Character from "./Character.type";

type Effect = {
    priority: number;

    solve(targetedCharacter?: Character): void;
};

export default Effect;