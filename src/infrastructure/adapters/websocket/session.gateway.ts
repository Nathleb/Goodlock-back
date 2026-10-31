import { UseFilters, UseGuards, UsePipes, ValidationError, ValidationPipe } from '@nestjs/common';
import {
    WebSocketGateway,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    WsException,
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
import { SelectDeckPayload } from './payloads/SelectDeck.payload';
import { ConfirmSelectionPayload } from './payloads/ConfirmSelection.payload';

import { SessionGuard } from './guards/Session.guard';
import { WsErrorFilter } from './filters/WsError.filter';
import { UserId } from '@shared/branded.types';

// Global pipes do not reach gateways: payloads are validated here, and a rejected one is
// answered with an 'error' { code: 'INVALID_REQUEST', message } event by the WsErrorFilter.
const payloadPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) =>
        new WsException(errors.flatMap(e => Object.values(e.constraints ?? {})).join('; ') || 'Invalid payload'),
});

@UseGuards(SessionGuard)
@UsePipes(payloadPipe)
@UseFilters(WsErrorFilter)
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

    @SubscribeMessage('selectDeck')
    handleSelectDeck(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: SelectDeckPayload,
    ): Promise<void> {
        return this.roomCoordinator.selectDeck(client.id, data.deckId);
    }

    // ── Game ─────────────────────────────────────────────────────────────────

    @SubscribeMessage('confirmSelection')
    handleConfirmSelection(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: ConfirmSelectionPayload,
    ): void {
        this.gameCoordinator.confirmSelection(client.id, data.characterIds);
    }

    @SubscribeMessage('cancelSelection')
    handleCancelSelection(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.cancelSelection(client.id);
    }

    @SubscribeMessage('startGame')
    handleStartGame(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.startGame(client.id);
    }

    @SubscribeMessage('rearrangeTeam')
    handleRearrangeTeam(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: RearrangeTeamPayload,
    ): void {
        this.gameCoordinator.rearrangeTeam(client.id, data.slots);
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

}
