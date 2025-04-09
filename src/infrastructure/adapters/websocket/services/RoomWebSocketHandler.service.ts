import { Injectable } from '@nestjs/common';
import { WebSocketService } from './webSocket.service';
import { RoomDTO } from '@application/dtos/Room.dto';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { Session } from '@domain/types/Session.type';
import { Room } from '@domain/types/Room.type';

@Injectable()
export class RoomWebSocketHandlerService {
    constructor(private webSocketService: WebSocketService) { }

    handleRoomJoin(joiningPlayer: Session, room: Room): void {
        const roomDTO = RoomMapper.toDTO(room);
        this.webSocketService.joinRoom(joiningPlayer.socketId, roomDTO.roomId);
        this.webSocketService.emitToRoom(roomDTO.roomId, "joinRoom", roomDTO);
    }

    handleRoomQuit(session: Session, room: Room | null): void {
        if (room) {
            const roomDTO = RoomMapper.toDTO(room);
            this.webSocketService.leaveRoom(session.socketId, roomDTO.roomId);
            this.webSocketService.emitToRoom(roomDTO.roomId, "joinRoom", roomDTO);
        }
    }

    notifyNewOwner(newOwnerSocketId: string): void {
        this.webSocketService.emitToSocket(newOwnerSocketId, 'isPlayerOwner', true);
    }
}
