import { Injectable } from '@nestjs/common';
import { SessionService } from '@domain/services/Session.service';
import { Session } from '@domain/types/Session.type';
import { SessionWebSocketHandlerService } from '@infrastructure/adapters/websocket/services/SessionWebSocketHandler.service';

@Injectable()
export class SessionCoordinatorService {
    constructor(
        private readonly sessionService: SessionService,
        private readonly sessionWebSocketHandler: SessionWebSocketHandlerService
    ) { }

    createOrReconnectSession(socketId: string, deviceIdentifier: string): Session {
        const session = this.sessionService.createOrReconnectSession(socketId, deviceIdentifier);
        this.sessionWebSocketHandler.notifySessionUpdate(session, 'sessionConnect');
        return session;
    }

    disconnectSession(socketId: string): void {
        this.sessionService.disconnectSession(socketId);
        this.sessionWebSocketHandler.notifySessionUpdate(undefined, 'sessionDisconnect');
    }

    getSession(socketId: string): Session | undefined {
        return this.sessionService.getSession(socketId);
    }
}
