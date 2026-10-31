import { UserId, SocketId } from '@shared/branded.types';

export type Session = {
    sessionId: string;
    socketId: SocketId;
    userId: UserId;
    roomId?: string;
};
