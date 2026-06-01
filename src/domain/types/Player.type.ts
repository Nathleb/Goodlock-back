import Character from "./Character.type";
import { PlayerIndex } from "./Position.type";

export type Player = {
    readonly playerIndex: PlayerIndex;
    readonly team: readonly Character[];
};
