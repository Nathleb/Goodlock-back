import { UserId, SocketId, SessionId } from '@shared/branded.types';

export type Session = {
    sessionId: SessionId;
    socketId: SocketId;
    userId: UserId;
    roomId?: string;
};
