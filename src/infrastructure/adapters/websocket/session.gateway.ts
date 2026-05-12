import { UseGuards } from '@nestjs/common';
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
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { JoinRoomPayload } from './payloads/JoinRoom.payload';
import { RearrangeTeamPayload } from './payloads/RearrangeTeam.payload';
import { ToggleDieLockPayload } from './payloads/ToggleDieLock.payload';
import { SelectTargetPayload } from './payloads/SelectTarget.payload';
import { SessionGuard } from './guards/Session.guard';

@UseGuards(SessionGuard)
@WebSocketGateway({ cors: { origin: '*' } })
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    constructor(
        private readonly shared: SharedWebSocketService,
        private readonly sessionCoordinator: SessionCoordinatorService,
        private readonly roomCoordinator: RoomCoordinatorService,
        private readonly gameCoordinator: GameCoordinatorService,
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

    // ── Lobby ────────────────────────────────────────────────────────────────

    @SubscribeMessage('createRoom')
    handleCreateRoom(@ConnectedSocket() client: Socket): void {
        this.roomCoordinator.createRoom(client.id);
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: JoinRoomPayload,
    ): void {
        this.roomCoordinator.joinRoom(client.id, data.roomId);
    }

    @SubscribeMessage('quitRoom')
    handleQuitRoom(@ConnectedSocket() client: Socket): void {
        this.roomCoordinator.quitRoom(client.id);
    }

    // ── Game ─────────────────────────────────────────────────────────────────

    @SubscribeMessage('startGame')
    handleStartGame(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.startGame(client.id);
    }

    @SubscribeMessage('rearrangeTeam')
    handleRearrangeTeam(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: RearrangeTeamPayload,
    ): void {
        this.gameCoordinator.rearrangeTeam(client.id, data.characterIds);
    }

    @SubscribeMessage('confirmPlacement')
    handleConfirmPlacement(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.confirmPlacement(client.id);
    }

    @SubscribeMessage('toggleDieLock')
    handleToggleDieLock(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: ToggleDieLockPayload,
    ): void {
        this.gameCoordinator.toggleDieLock(client.id, data.characterId);
    }

    @SubscribeMessage('confirmKeep')
    handleConfirmKeep(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.confirmKeep(client.id);
    }

    @SubscribeMessage('selectTarget')
    handleSelectTarget(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: SelectTargetPayload,
    ): void {
        this.gameCoordinator.selectTarget(client.id, data.characterId, data.target);
    }

    @SubscribeMessage('confirmAssignment')
    handleConfirmAssignment(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.confirmAssignment(client.id);
    }
}
