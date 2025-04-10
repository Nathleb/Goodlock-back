import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { ErrorWebSocketHandlerService } from '@infrastructure/adapters/websocket/services/ErrorWebSocketHandler.service';
import { SharedWebSocketService } from './shared.gateway';

@WebSocketGateway()
export class SessionGateway {
    private server = this.sharedWebSocketService.getServer();

    constructor(
        private roomService: RoomCoordinatorService,
        private sessionService: SessionCoordinatorService,
        private errorHandler: ErrorWebSocketHandlerService,
        private sharedWebSocketService: SharedWebSocketService
    ) { }

    handleConnection(client: Socket) {
        try {
            const deviceIdentifier = client.handshake.query.deviceIdentifier;
            if (typeof deviceIdentifier === 'string') {
                this.sessionService.createOrReconnectSession(client.id, deviceIdentifier);
            }
        } catch (error) {
            this.errorHandler.sendError(client.id, `Connection error: ${error.message}`);
        }
    }

    handleDisconnect(client: Socket) {
        try {
            this.sessionService.disconnectSession(client.id);
        } catch (error) {
            this.errorHandler.sendError(client.id, `Disconnection error: ${error.message}`);
        }
    }

    @SubscribeMessage('createRoom')
    createRoom(client: Socket): void {
        try {
            const session = this.sessionService.getSession(client.id);
            if (!session) throw new Error("Session not found");
            this.roomService.createRoom(session);
        } catch (error) {
            this.errorHandler.sendError(client.id, `Error while creating room: ${error.message}`);
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
            this.errorHandler.sendError(client.id, `Error while joining room: ${error.message}`);
        }
    }

    @SubscribeMessage('quitRoom')
    quitRoom(client: Socket): void {
        try {
            const session = this.sessionService.getSession(client.id);
            if (!session) throw new Error("Session not found");
            this.roomService.quitRoom(session);
        } catch (error) {
            this.errorHandler.sendError(client.id, `Error while quitting room: ${error.message}`);
        }
    }
}