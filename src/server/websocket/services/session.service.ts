import { Injectable } from '@nestjs/common';
import { Session } from '../types/Session.type';
import { SessionManager } from '../managers/session.manager';
import { RoomManager } from '../managers/room.manager';

@Injectable()
export class SessionService {

    constructor(private readonly sessionManager: SessionManager, private readonly roomanager: RoomManager) { };

    getSession(socketId: string): Session | undefined {
        return this.sessionManager.getSession(socketId);
    }

    getSessionByDeviceIdentifier(deviceIdentifier: string): Session | undefined {
        return this.sessionManager.getSessionByDeviceIdentifier(deviceIdentifier);
    }

    createSession(socketId: string, deviceIdentifier: string): Session {
        return this.sessionManager.createSession(socketId, deviceIdentifier);
    }

    reconnectSessionByDeviceIdentifier(socketId: string, deviceIdentifier: string): Session {
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

    updateSessionRoom(sessionId: string, roomId: string): Session {
        return this.sessionManager.updateSession(sessionId, { inRoomId: roomId });
    }
}
