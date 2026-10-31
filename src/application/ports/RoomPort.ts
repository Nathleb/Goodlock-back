import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import { CatalogId, SessionId } from '@shared/branded.types';
import { DomainError } from '@domain/errors/DomainError';
import { Result } from '@shared/result.type';

export interface RoomPort {
    createRoom(ownerId: SessionId): Room;
    joinRoom(playerId: SessionId, roomId: string): Result<Room, DomainError>;
    quitRoom(playerId: SessionId): Room | null;
    getRoom(roomId: string): Room | undefined;
    startGame(roomId: string, gameState: GameState): Result<Room, DomainError>;
    updateGameState(roomId: string, gameState: GameState): void;
    listOpenRooms(): Room[];
    setDeckSelection(roomId: string, playerId: SessionId, characterIds: readonly CatalogId[]): Result<Room, DomainError>;
    setPresence(roomId: string, playerIndex: number, connected: boolean, now: number): Room | undefined;
}
