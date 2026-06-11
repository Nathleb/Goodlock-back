import { UserId } from '@shared/branded.types';
import { Session } from '@application/dtos/Session.dto';

export type ConnectResult = {
    session: Session;
    /** Socket to kick because this user signed in elsewhere; null when none is live. */
    evictedSocketId: string | null;
};

export interface SessionPort {
    createOrReconnectSession(socketId: string, userId: UserId): ConnectResult;
    getSession(socketId: string): Session | undefined;
    setSessionRoom(socketId: string, roomId: string | undefined): void;
    disconnectSession(socketId: string): void;
    deleteSession(socketId: string): void;
}
