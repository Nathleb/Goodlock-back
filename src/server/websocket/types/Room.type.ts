import GameState from "../../../domain/types/GameState.type";

export type Room = {
    roomId: string;
    playersId: string[];
    ownerId: string;
    isStarted: boolean;
    gameState?: GameState;
}
