import {
    WebSocketGateway,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SharedWebSocketService } from './services/SharedWebSocketService';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    constructor(
        private readonly shared: SharedWebSocketService,
        private readonly sessionCoordinator: SessionCoordinatorService,
        private readonly roomCoordinator: RoomCoordinatorService,
    ) {}

    afterInit(server: Server): void {
        this.shared.setServer(server);
    }

    handleConnection(client: Socket): void {
        const deviceIdentifier = client.handshake.auth?.deviceIdentifier;
        if (!deviceIdentifier) {
            client.disconnect();
            return;
        }
        this.sessionCoordinator.handleConnect(client.id, deviceIdentifier);
    }

    handleDisconnect(client: Socket): void {
        this.sessionCoordinator.handleDisconnect(client.id);
    }

    @SubscribeMessage('createRoom')
    handleCreateRoom(@ConnectedSocket() client: Socket): void {
        this.roomCoordinator.createRoom(client.id);
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { roomId: string },
    ): void {
        this.roomCoordinator.joinRoom(client.id, data.roomId);
    }

    @SubscribeMessage('quitRoom')
    handleQuitRoom(@ConnectedSocket() client: Socket): void {
        this.roomCoordinator.quitRoom(client.id);
    }
}
