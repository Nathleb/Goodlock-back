import { Injectable } from '@nestjs/common';
import { Room } from '../types/Room.type';
import { Session } from '../types/Session.type';
import { DEFAULT } from '../constants/Default.constants';
import { WebSocketService } from './WebSocket.service';

@Injectable()
export class RoomService {
    private rooms: Map<string, Room> = new Map();

    constructor(private webSocketService: WebSocketService) { }

    createRoom(owner: Session): Room {
        const roomId = crypto.randomUUID();
        const room: Room = {
            id: roomId,
            players: [owner],
            ownerId: owner.deviceIdentifier,
            isStarted: false
        };

        this.rooms.set(roomId, room);
        this.webSocketService.joinRoom(owner.socketId, roomId);
        this.webSocketService.emitToSocket(owner.socketId, 'createRoom', roomId);

        return room;
    }

    joinRoom(joiningPlayer: Session, roomId: string): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        if (room.players.length >= 2) throw new Error('Room is full');
        if (room.isStarted) throw new Error('Game already started');

        room.players.push(joiningPlayer);
        this.webSocketService.joinRoom(joiningPlayer.socketId, roomId);
        this.webSocketService.emitToRoom(roomId, "joinRoom", room);

        return room;
    }

    quitRoom(session: Session): Room | null {
        const roomId = session.inRoomId;
        if (roomId === DEFAULT.NO_ROOM) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        room.players = room.players.filter(p => p.socketId !== session.socketId);
        this.webSocketService.leaveRoom(session.socketId, roomId);

        if (room.players.length === 0) {
            this.rooms.delete(roomId);
            return null;
        }

        if (room.ownerId === session.deviceIdentifier) {
            room.ownerId = room.players[0].deviceIdentifier;
            this.webSocketService.emitToSocket(room.players[0].socketId, 'isPlayerOwner', true);
        }

        this.webSocketService.emitToRoom(roomId, "joinRoom", room);
        return room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }
}
