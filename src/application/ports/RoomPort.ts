import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';

export interface RoomPort {
    createRoom(ownerId: string): Room;
    joinRoom(playerId: string, roomId: string): Room;
    quitRoom(playerId: string): Room | null;
    getRoom(roomId: string): Room | undefined;
    startGame(roomId: string, gameState: GameState): Room;
    updateGameState(roomId: string, gameState: GameState): void;
    listOpenRooms(): Room[];
    setPresence(roomId: string, playerIndex: number, connected: boolean, now: number): Room | undefined;
}
