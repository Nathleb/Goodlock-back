import { UserId, SocketId, SessionId, RoomId } from '@shared/branded.types';

export type Session = {
    sessionId: SessionId;
    socketId: SocketId;
    userId: UserId;
    roomId?: RoomId;
};
