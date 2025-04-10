import { Injectable } from '@nestjs/common';
import { SessionPort } from '@application/ports/SessionPort';
import { Session } from '@domain/types/Session.type';
import { SessionManager } from '../../infrastructure/adapters/managers/session.manager';

@Injectable()
export class SessionService implements SessionPort {

    constructor(private readonly sessionManager: SessionManager) { };

    getSession(socketId: string): Session | undefined {
        return this.sessionManager.getSession(socketId);
    }

    getSessionByDeviceIdentifier(deviceIdentifier: string): Session | undefined {
        return this.sessionManager.getSessionByDeviceIdentifier(deviceIdentifier);
    }

    createOrReconnectSession(socketId: string, deviceIdentifier: string): Session {
        const existingSession = this.getSessionByDeviceIdentifier(deviceIdentifier);

        if (existingSession) {
            this.sessionManager.updateSession(existingSession.socketId, {
                isConnected: true,
                socketId: socketId,
                lastUpdate: new Date()
            });
        } else {
            this.sessionManager.createSession(socketId, deviceIdentifier);
        }

        return this.sessionManager.getSession(socketId)!;
    }

    getAllSessions(): Session[] {
        return this.sessionManager.getAllSessions();
    }

    deleteSession(socketId: string): void {
        this.sessionManager.deleteSession(socketId);
    }

    updateSession(sessionId: string, updates: Partial<Session>): Session {
        return this.sessionManager.updateSession(sessionId, updates);
    }

    disconnectSession(socketId: string): void {
        const session = this.sessionManager.getSession(socketId);
        if (session) {
            this.sessionManager.updateSession(socketId, {
                isConnected: false,
                lastUpdate: new Date()
            });
        }
    }
}