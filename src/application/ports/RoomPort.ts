import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import { CatalogId, SessionId, RoomId } from '@shared/branded.types';
import { DomainError } from '@domain/errors/DomainError';
import { Result } from '@shared/result.type';

export interface RoomPort {
    createRoom(ownerId: SessionId): Room;
    joinRoom(playerId: SessionId, roomId: RoomId): Result<Room, DomainError>;
    quitRoom(playerId: SessionId): Room | null;
    getRoom(roomId: RoomId): Room | undefined;
    startGame(roomId: RoomId, gameState: GameState): Result<Room, DomainError>;
    updateGameState(roomId: RoomId, gameState: GameState): void;
    listOpenRooms(): Room[];
    setDeckSelection(roomId: RoomId, playerId: SessionId, characterIds: readonly CatalogId[]): Result<Room, DomainError>;
    setPresence(roomId: RoomId, playerIndex: number, connected: boolean, now: number): Room | undefined;
}
