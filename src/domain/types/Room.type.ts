import GameState from "./GameState.type";

export type Room = {
    roomId: string;
    name: string; // Added property
    playersId: string[];
    ownerId: string;
    isStarted: boolean;
    gameState?: GameState;
};
