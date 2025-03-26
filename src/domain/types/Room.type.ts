import { Session } from "./Session.type";
import GameState from "./GameState.type";

export type Room = {
    id: string;
    players: Session[];
    isStarted: boolean;
    ownerId: string;
    gameState?: GameState;
}
