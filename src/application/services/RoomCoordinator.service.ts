import { Injectable } from '@nestjs/common';
import { RoomService } from '@domain/services/Room.service';
import { Session } from '@domain/types/Session.type';
import { Room } from '@domain/types/Room.type';
import { RoomWebSocketHandlerService } from '@infrastructure/adapters/websocket/services/RoomWebSocketHandler.service';

@Injectable()
export class RoomCoordinatorService {
    constructor(
        private readonly roomService: RoomService,
        private readonly roomWebSocketHandler: RoomWebSocketHandlerService
    ) { }

    createRoom(owner: Session): Room {
        if (!owner) {
            throw new Error("Owner session is undefined");
        }
        const room = this.roomService.createRoom(owner);
        this.roomWebSocketHandler.handleRoomJoin(owner, room);
        return room;
    }

    joinRoom(joiningPlayer: Session, roomId: string): Room {
        if (!joiningPlayer) {
            throw new Error("Joining player session is undefined");
        }
        const room = this.roomService.joinRoom(joiningPlayer, roomId);
        this.roomWebSocketHandler.handleRoomJoin(joiningPlayer, room);
        return room;
    }

    quitRoom(session: Session): Room | null {
        if (!session) {
            throw new Error("Session is undefined");
        }
        const room = this.roomService.quitRoom(session);
        this.roomWebSocketHandler.handleRoomQuit(session, room);

        if (room && room.ownerId === session.sessionId && room.playersId.length > 0) {
            this.roomWebSocketHandler.notifyNewOwner(room.ownerId);
        }

        return room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.roomService.getRoom(roomId);
    }
}
