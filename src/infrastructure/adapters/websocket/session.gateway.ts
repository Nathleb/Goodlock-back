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
import { JwtService } from '@nestjs/jwt';
import { SharedWebSocketService } from './services/SharedWebSocketService';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { JoinRoomPayload } from './payloads/JoinRoom.payload';
import { RearrangeTeamPayload } from './payloads/RearrangeTeam.payload';
import { ConfirmKeepPayload } from './payloads/ConfirmKeep.payload';
import { ConfirmAssignmentPayload } from './payloads/ConfirmAssignment.payload';

import { SessionGuard } from './guards/Session.guard';
import { UserId } from '@shared/branded.types';

@UseGuards(SessionGuard)
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ?? '*' } })
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    constructor(
        private readonly shared: SharedWebSocketService,
        private readonly sessionCoordinator: SessionCoordinatorService,
        private readonly roomCoordinator: RoomCoordinatorService,
        private readonly gameCoordinator: GameCoordinatorService,
        private readonly jwtService: JwtService,
    ) {}

    afterInit(server: Server): void {
        this.shared.setServer(server);
    }

    handleConnection(client: Socket): void {
        const token = client.handshake.auth?.token as string | undefined;
        if (!token) {
            client.disconnect();
            return;
        }
        try {
            const payload = this.jwtService.verify<{ sub: string }>(token);
            this.sessionCoordinator.handleConnect(client.id, payload.sub as UserId);
        } catch {
            client.disconnect();
        }
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

    @SubscribeMessage('confirmKeep')
    handleConfirmKeep(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: ConfirmKeepPayload,
    ): void {
        this.gameCoordinator.confirmKeep(client.id, data.lockedCharacterIds);
    }

    @SubscribeMessage('confirmAssignment')
    handleConfirmAssignment(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: ConfirmAssignmentPayload,
    ): void {
        this.gameCoordinator.confirmAssignment(client.id, data.targets);
    }

    @SubscribeMessage('claimVictory')
    handleClaimVictory(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.claimVictory(client.id);
    }

    @SubscribeMessage('cancelPlacement')
    handleCancelPlacement(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.cancelPlacement(client.id);
    }

    @SubscribeMessage('cancelKeep')
    handleCancelKeep(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.cancelKeep(client.id);
    }

    @SubscribeMessage('cancelAssignment')
    handleCancelAssignment(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.cancelAssignment(client.id);
    }
}
