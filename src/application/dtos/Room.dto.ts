import { GameStateDTO } from "./GameState.dto";


export type RoomDTO = {
    roomId: string;
    players: PlayersDTO[];
    ownerId: string;
    isStarted: boolean;
    gameState?: GameStateDTO;
}
