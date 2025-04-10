import { Session } from "@domain/types/Session.type";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DEFAULT } from "@infrastructure/adapters/websocket/constants/Default.constants";


@Injectable()
export class SessionManager {
    private sessions: Map<string, Session> = new Map<string, Session>();

    createSession(socketId: string, deviceIdentifier: string): Session {
        const session: Session = {
            socketId: socketId,
            pseudo: `Player-${randomUUID().substring(0, 4)}`,
            inRoomId: DEFAULT.NO_ROOM,
            deviceIdentifier: deviceIdentifier,
            lastUpdate: new Date(),
            isConnected: true,
            sessionId: randomUUID()
        };

        this.sessions.set(socketId, session);
        return session;
    }

    getSession(socketId: string): Session | undefined {
        return this.sessions.get(socketId);
    }

    deleteSession(socketId: string): void {
        this.sessions.delete(socketId);
    };

    updateSession(socketId: string, partialSession: Partial<Session>): Session | undefined {
        const existingSession = this.sessions.get(socketId);
        if (!existingSession) {
            return undefined;
        }

        const updatedSession = {
            ...existingSession,
            ...partialSession,
            lastUpdate: new Date()
        };

        this.sessions.set(socketId, updatedSession);
        return updatedSession;
    }

    getAllSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    getSessionByDeviceIdentifier(deviceIdentifier: string): Session | undefined {
        return Array.from(this.sessions.values()).find(session => session.deviceIdentifier === deviceIdentifier);
    }
}

export const sessionManager = new SessionManager();