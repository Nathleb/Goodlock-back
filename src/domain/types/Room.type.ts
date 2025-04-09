import GameState from "./GameState.type";

export type Room = {
    roomId: string;
    playersId: string[];
    ownerId: string;
    isStarted: boolean;
    gameState?: GameState;
}
