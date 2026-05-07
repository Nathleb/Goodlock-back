import Character from "./Character.type";
import { PlayerIndex } from "./Position.type";

export type Player = {
    playerIndex: PlayerIndex;
    team: Character[];
};
