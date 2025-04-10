import { Injectable } from '@nestjs/common';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { Session } from '@domain/types/Session.type';
import { Room } from '@domain/types/Room.type';
import { WebSocketPort } from '@application/ports/WebSocketPort';

@Injectable()
export class RoomWebSocketHandlerService {
    constructor(private webSocketService: WebSocketPort) { }

    handleRoomJoin(joiningPlayer: Session, room: Room): void {
        const roomDTO = RoomMapper.toDTO(room);
        this.webSocketService.joinRoom(joiningPlayer.socketId, roomDTO.roomId);
        this.webSocketService.emitToRoom(roomDTO.roomId, "joinRoom", roomDTO);
    }

    handleRoomQuit(session: Session, room: Room | null): void {
        if (room) {
            const roomDTO = RoomMapper.toDTO(room);
            this.webSocketService.leaveRoom(session.socketId, roomDTO.roomId);
            this.webSocketService.emitToRoom(roomDTO.roomId, "roomUpdate", roomDTO);
        }
    }

    notifyNewOwner(newOwnerSocketId: string): void {
        this.webSocketService.emitToSocket(newOwnerSocketId, 'isPlayerOwner', true);
    }
}
