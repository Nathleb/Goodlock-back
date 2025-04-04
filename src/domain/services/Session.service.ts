import { Injectable } from '@nestjs/common';
import { Session } from '../types/Session.type';

@Injectable()
export class SessionService {
    private sessions: Map<string, Session> = new Map();
    private deviceSessions: Map<string, string> = new Map();

    getSession(socketId: string): Session | undefined {
        return this.sessions.get(socketId);
    }

    getSessionByDeviceIdentifier(deviceIdentifier: string): Session | undefined {
        const socketId = this.deviceSessions.get(deviceIdentifier);
        return socketId ? this.sessions.get(socketId) : undefined;
    }

    createSession(socketId: string, deviceIdentifier: string): Session {
        const session = Session.create(socketId, deviceIdentifier);
        this.sessions.set(socketId, session);
        this.deviceSessions.set(deviceIdentifier, socketId);
        return session;
    }

    reconnectSessionByDeviceIdentifier(socketId: string, deviceIdentifier: string): Session | null {
        const existingSession = this.getSessionByDeviceIdentifier(deviceIdentifier);
        if (existingSession) {
            const updatedSession = existingSession.withSocketId(socketId);
            this.sessions.set(socketId, updatedSession);
            return updatedSession;
        }
        return null;
    }

    updateSessionRoom(session: Session, roomId: string): Session {
        const updatedSession = session.withRoomId(roomId);
        this.sessions.set(session.socketId, updatedSession);
        return updatedSession;
    }
}
