import { Injectable } from '@nestjs/common';
import { RoomPort } from '@application/ports/RoomPort';
import { Room } from '@domain/types/Room.type';
import { createRoom, addPlayerToRoom, removePlayerFromRoom } from '@domain/services/Room.service';

@Injectable()
export class RoomManager implements RoomPort {
    private readonly rooms = new Map<string, Room>();
    private readonly playerToRoom = new Map<string, string>();

    createRoom(ownerId: string): Room {
        const room = createRoom(ownerId);
        this.rooms.set(room.roomId, room);
        this.playerToRoom.set(ownerId, room.roomId);
        return room;
    }

    joinRoom(playerId: string, roomId: string): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        const updated = addPlayerToRoom(room, playerId);
        this.rooms.set(roomId, updated);
        this.playerToRoom.set(playerId, roomId);
        return updated;
    }

    quitRoom(playerId: string): Room | null {
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

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }
}
