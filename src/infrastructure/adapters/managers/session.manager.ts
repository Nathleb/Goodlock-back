import { Injectable } from '@nestjs/common';
import { ConnectResult, SessionPort } from '@application/ports/SessionPort';
import { Session } from '@application/dtos/Session.dto';
import { UserId, SocketId, SessionId } from '@shared/branded.types';

@Injectable()
export class SessionManager implements SessionPort {
    // One active session per userId. A second connect evicts the previous socketId entry
    // (reconnect wins). The caller is responsible for disconnecting the evicted socket
    // (see ConnectResult.evictedSocketId).
    private readonly bySockId = new Map<string, Session>();
    private readonly byUserId = new Map<UserId, Session>();
    // sessionId is stable across reconnects; rooms reference players by it, so
    // this index lets coordinators resolve a player's live socket to emit to.
    private readonly bySessionId = new Map<string, Session>();

    createOrReconnectSession(socketId: SocketId, userId: UserId): ConnectResult {
        const existing = this.byUserId.get(userId);
        if (existing) {
            const evictedSocketId = existing.socketId !== socketId && this.bySockId.has(existing.socketId)
                ? existing.socketId
                : null;
            this.bySockId.delete(existing.socketId);
            const reconnected: Session = { ...existing, socketId };
            this.bySockId.set(socketId, reconnected);
            this.byUserId.set(userId, reconnected);
            this.bySessionId.set(reconnected.sessionId, reconnected);
            return { session: reconnected, evictedSocketId };
        }
        const session: Session = {
            sessionId: crypto.randomUUID() as SessionId,
            socketId,
            userId,
        };
        this.bySockId.set(socketId, session);
        this.byUserId.set(userId, session);
        this.bySessionId.set(session.sessionId, session);
        return { session, evictedSocketId: null };
    }

    getSession(socketId: SocketId): Session | undefined {
        return this.bySockId.get(socketId);
    }

    getSessionById(sessionId: SessionId): Session | undefined {
        return this.bySessionId.get(sessionId);
    }

    setSessionRoom(socketId: SocketId, roomId: string | undefined): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        const updated: Session = { ...session, roomId };
        this.bySockId.set(socketId, updated);
        this.byUserId.set(session.userId, updated);
        this.bySessionId.set(session.sessionId, updated);
    }

    disconnectSession(socketId: SocketId): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        // byUserId / bySessionId entries stay — enables reconnection
    }

    deleteSession(socketId: SocketId): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        this.byUserId.delete(session.userId);
        this.bySessionId.delete(session.sessionId);
    }
}
