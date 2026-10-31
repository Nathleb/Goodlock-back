import { UserId, SocketId, SessionId, RoomId } from '@shared/branded.types';
import { Session } from '@application/dtos/Session.dto';

export type ConnectResult = {
    session: Session;
    /** Socket to kick because this user signed in elsewhere; null when none is live. */
    evictedSocketId: SocketId | null;
};

export interface SessionPort {
    createOrReconnectSession(socketId: SocketId, userId: UserId): ConnectResult;
    getSession(socketId: SocketId): Session | undefined;
    /** Resolve a session by its stable sessionId (survives reconnects, unlike socketId). */
    getSessionById(sessionId: SessionId): Session | undefined;
    setSessionRoom(socketId: SocketId, roomId: RoomId | undefined): void;
    disconnectSession(socketId: SocketId): void;
    deleteSession(socketId: SocketId): void;
}
