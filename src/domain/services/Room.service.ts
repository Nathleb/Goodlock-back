import { Injectable } from '@nestjs/common';
import { RoomPort } from '@application/ports/RoomPort';
import { Room } from '@domain/types/Room.type';
import { Session } from '@domain/types/Session.type';
import { RoomManager } from "@infrastructure/adapters/managers/room.manager";
import { DEFAULT } from '@infrastructure/adapters/websocket/constants/Default.constants';

@Injectable()
export class RoomService implements RoomPort {
    constructor(private readonly roomManager: RoomManager) { }

    createRoom(owner: Session): Room {
        return this.roomManager.createRoom(owner.socketId);
    }

    joinRoom(joiningPlayer: Session, roomId: string): Room {
        const room = this.roomManager.getRoom(roomId);
        if (!room) throw new Error('Room not found');
        if (room.playersId.length >= 2) throw new Error('Room is full');
        if (room.isStarted) throw new Error('Game already started');

        room.playersId.push(joiningPlayer.sessionId);
        return this.roomManager.updateRoom(roomId, room)!;
    }

    quitRoom(session: Session): Room | null {
        const roomId = session.inRoomId;
        if (roomId === DEFAULT.NO_ROOM) return null;

        const room = this.roomManager.getRoom(roomId);
        if (!room) return null;

        room.playersId = room.playersId.filter(id => id !== session.sessionId);

        if (room.playersId.length === 0) {
            this.roomManager.deleteRoom(roomId);
            return null;
        }

        if (room.ownerId === session.sessionId) {
            room.ownerId = room.playersId[0];
        }

        return this.roomManager.updateRoom(roomId, room)!;
    }

    getRoom(roomId: string): Room | undefined {
        return this.roomManager.getRoom(roomId);
    }
}
