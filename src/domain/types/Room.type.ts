import GameState from "./GameState.type";

export type Room = {
    readonly roomId: string;
    readonly playersId: readonly string[];
    readonly ownerId: string;
    readonly isStarted: boolean;
    readonly gameState?: GameState;
};
