import { WebSocketGateway, SubscribeMessage, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';

@WebSocketGateway(3002, { cors: true })
export class GameGateway {
    @WebSocketServer()
    server: Server;

    constructor(
        private roomService: RoomCoordinatorService,
        private sessionService: SessionCoordinatorService
    ) { }

    handleConnection(client: Socket) {
        const deviceIdentifier = client.handshake.query.deviceIdentifier;
        if (typeof deviceIdentifier === 'string') {
            this.sessionService.createOrReconnectSession(client.id, deviceIdentifier);
        }
    }

    handleDisconnect(client: Socket) {
        this.sessionService.disconnectSession(client.id);
    }

    @SubscribeMessage('createRoom')
    createRoom(client: Socket): void {
        try {
            const session = this.sessionService.getSession(client.id);
            if (!session) throw new Error("Session not found");
            this.roomService.createRoom(session);
        } catch (error) {
            client.emit("error", `Error while creating room: ${error.message}`);
        }
    }

    @SubscribeMessage('joinRoom')
    joinRoom(client: Socket, payload: string): void {
        try {
            const { roomId } = JSON.parse(payload);
            const session = this.sessionService.getSession(client.id);
            if (!session) throw new Error("Session not found");
            this.roomService.joinRoom(session, roomId);
        } catch (error) {
            client.emit("error", `Error while joining room: ${error}`);
        }
    }

    @SubscribeMessage('quitRoom')
    quitRoom(client: Socket): void {
        const session = this.sessionService.getSession(client.id);
        if (!session) throw new Error("Session not found");
        this.roomService.quitRoom(session);
        client.emit("getSessionInfos", { pseudo: session.pseudo, inRoomId: session.inRoomId });
    }
}