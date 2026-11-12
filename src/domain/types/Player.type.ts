import Character from "./Character.type";
import { PlayerIndex } from "./Position.type";

export type Player = {
    readonly playerIndex: PlayerIndex;
    /** The characters on the board, ordered by slot. */
    readonly team: readonly Character[];
    /** The characters who died and left the board (DEAD-1), in order of death. Absent: nobody died. */
    readonly fallen?: readonly Character[];
};
