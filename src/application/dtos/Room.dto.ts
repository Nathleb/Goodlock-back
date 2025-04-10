import { GameStateDTO } from "./GameState.dto";
import { PlayerDTO } from "./Player.dto";


export type RoomDTO = {
    roomId: string;
    players: PlayerDTO[];
    ownerId: string;
    isStarted: boolean;
    gameState?: GameStateDTO;
}
