import Character from "./Character.type";
import PlayerIndex from "./PlayerIndex.type";

export type Player = {
    playerIndex: PlayerIndex;
    team: Character[];
};