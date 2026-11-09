import { Injectable } from '@nestjs/common';
import { RoomPort } from '@application/ports/RoomPort';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import { hasFreeSeat, createRoom, addPlayerToRoom, removePlayerFromRoom, startRoom, selectDeckInRoom } from '@domain/services/Room.service';
import { CatalogId, SessionId, RoomId } from '@shared/branded.types';
import { DomainError, domainError } from '@domain/errors/DomainError';
import { Result, err } from '@shared/result.type';

const ROOM_NOT_FOUND = domainError('ROOM_NOT_FOUND', 'Room not found');

@Injectable()
export class RoomManager implements RoomPort {
    private readonly rooms = new Map<RoomId, Room>();
    private readonly playerToRoom = new Map<SessionId, RoomId>();

    createRoom(ownerId: SessionId): Room {
        const room = createRoom(ownerId);
        this.rooms.set(room.roomId, room);
        this.playerToRoom.set(ownerId, room.roomId);
        return room;
    }

    joinRoom(playerId: SessionId, roomId: RoomId): Result<Room, DomainError> {
        const room = this.rooms.get(roomId);
        if (!room) return err(ROOM_NOT_FOUND);
        return addPlayerToRoom(room, playerId).map(updated => {
            this.rooms.set(roomId, updated);
            this.playerToRoom.set(playerId, roomId);
            return updated;
        });
    }

    quitRoom(playerId: SessionId): Room | null {
        const roomId = this.playerToRoom.get(playerId);
        if (!roomId) return null;
        const room = this.rooms.get(roomId);
        if (!room) return null;
        const updated = removePlayerFromRoom(room, playerId);
        this.playerToRoom.delete(playerId);
        if (updated === null) {
            this.rooms.delete(roomId);
        } else {
            this.rooms.set(roomId, updated);
        }
        return updated;
    }

    setDeckSelection(roomId: RoomId, playerId: SessionId, characterIds: readonly CatalogId[]): Result<Room, DomainError> {
        const room = this.rooms.get(roomId);
        if (!room) return err(ROOM_NOT_FOUND);
        return selectDeckInRoom(room, playerId, characterIds).map(updated => {
            this.rooms.set(roomId, updated);
            return updated;
        });
    }

    closeRoom(roomId: RoomId): Room | undefined {
        const room = this.rooms.get(roomId);
        if (!room) return undefined;
        this.rooms.delete(roomId);
        for (const [playerId, mappedRoomId] of this.playerToRoom.entries()) {
            if (mappedRoomId === roomId) this.playerToRoom.delete(playerId);
        }
        return room;
    }

    getRoom(roomId: RoomId): Room | undefined {
        return this.rooms.get(roomId);
    }

    startGame(roomId: RoomId, gameState: GameState): Result<Room, DomainError> {
        const room = this.rooms.get(roomId);
        if (!room) return err(ROOM_NOT_FOUND);
        return startRoom(room, gameState).map(started => {
            this.rooms.set(roomId, started);
            return started;
        });
    }

    updateGameState(roomId: RoomId, gameState: GameState): void {
        const room = this.rooms.get(roomId);
        if (!room || !room.isStarted) return;
        this.rooms.set(roomId, { ...room, gameState });
    }

    listOpenRooms(): Room[] {
        return [...this.rooms.values()].filter(room => !room.isStarted && hasFreeSeat(room));
    }
}
