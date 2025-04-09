import { Injectable } from '@nestjs/common';
import { RoomPort } from '@application/ports/RoomPort';
import { Room } from '@domain/types/Room.type';
import { Session } from '@domain/types/Session.type';
import { DEFAULT } from "src/infrastructure/adapters/websocket/constants/Default.constants";

@Injectable()
export class RoomService implements RoomPort {
    private rooms: Map<string, Room> = new Map();

    createRoom(owner: Session): Room {
        const roomId = crypto.randomUUID();
        const room: Room = {
            roomId: roomId,
            playersId: [owner.socketId],
            ownerId: owner.socketId,
            isStarted: false,
        };

        this.rooms.set(roomId, room);
        return room;
    }

    joinRoom(joiningPlayer: Session, roomId: string): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        if (room.playersId.length >= 2) throw new Error('Room is full');
        if (room.isStarted) throw new Error('Game already started');

        room.playersId.push(joiningPlayer.sessionId);
        return room;
    }

    quitRoom(session: Session): Room | null {
        const roomId = session.inRoomId;
        if (roomId === DEFAULT.NO_ROOM) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        room.playersId = room.playersId.filter(id => id !== session.sessionId);

        if (room.playersId.length === 0) {
            this.rooms.delete(roomId);
            return null;
        }

        if (room.ownerId === session.sessionId) {
            room.ownerId = room.playersId[0];
        }

        return room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }
}
