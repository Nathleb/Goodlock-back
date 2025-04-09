import { Injectable } from '@nestjs/common';
import { Room } from '../types/Room.type';
import { Session } from '../types/Session.type';
import { DEFAULT } from '../constants/Default.constants';
import { WebSocketService } from './webSocket.service';

@Injectable()
export class RoomService {
    private rooms: Map<string, Room> = new Map();

    constructor(private webSocketService: WebSocketService) { }

    createRoom(owner: Session): Room {
        const roomId = crypto.randomUUID();
        const room: Room = {
            roomId: roomId,
            playersId: [owner.socketId],
            ownerId: owner.socketId,
            isStarted: false,
        };

        this.rooms.set(roomId, room);
        this.webSocketService.joinRoom(owner.socketId, roomId);
        this.webSocketService.emitToSocket(owner.socketId, 'createRoom', roomId);
        //update le inRoomId du joueur

        return room;
    }

    joinRoom(joiningPlayer: Session, roomId: string): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        if (room.playersId.length >= 2) throw new Error('Room is full');
        if (room.isStarted) throw new Error('Game already started');

        room.playersId.push(joiningPlayer.sessionId);
        this.webSocketService.joinRoom(joiningPlayer.socketId, roomId);
        this.webSocketService.emitToRoom(roomId, "joinRoom", room);
        //update le inRoomId du joueur

        return room;
    }

    quitRoom(session: Session): Room | null {
        const roomId = session.inRoomId;
        if (roomId === DEFAULT.NO_ROOM) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        room.playersId = room.playersId.filter(id => id !== session.sessionId);
        this.webSocketService.leaveRoom(session.socketId, roomId);

        if (room.playersId.length === 0) {
            this.rooms.delete(roomId);
            return null;
        }

        if (room.ownerId === session.sessionId) {
            room.ownerId = room.playersId[0];
            this.webSocketService.emitToSocket(room.playersId[0], 'isPlayerOwner', true);
        }

        this.webSocketService.emitToRoom(roomId, "joinRoom", room);
        return room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }
}
