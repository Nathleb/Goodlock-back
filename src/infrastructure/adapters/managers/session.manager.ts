import { Injectable } from '@nestjs/common';
import { SessionPort } from '@application/ports/SessionPort';
import { Session } from '@application/dtos/Session.dto';
import { UserId } from '@shared/branded.types';

@Injectable()
export class SessionManager implements SessionPort {
    private readonly bySockId = new Map<string, Session>();
    private readonly byUserId = new Map<UserId, Session>();

    createOrReconnectSession(socketId: string, userId: UserId): Session {
        const existing = this.byUserId.get(userId);
        if (existing) {
            this.bySockId.delete(existing.socketId);
            const reconnected: Session = { ...existing, socketId };
            this.bySockId.set(socketId, reconnected);
            this.byUserId.set(userId, reconnected);
            return reconnected;
        }
        const session: Session = {
            sessionId: crypto.randomUUID(),
            socketId,
            userId,
        };
        this.bySockId.set(socketId, session);
        this.byUserId.set(userId, session);
        return session;
    }

    getSession(socketId: string): Session | undefined {
        return this.bySockId.get(socketId);
    }

    setSessionRoom(socketId: string, roomId: string | undefined): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        const updated: Session = { ...session, roomId };
        this.bySockId.set(socketId, updated);
        this.byUserId.set(session.userId, updated);
    }

    disconnectSession(socketId: string): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        // byUserId entry stays — enables reconnection
    }

    deleteSession(socketId: string): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        this.byUserId.delete(session.userId);
    }
}
