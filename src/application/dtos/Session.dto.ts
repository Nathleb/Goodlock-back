import { UserId } from '@shared/branded.types';

export type Session = {
    sessionId: string;
    socketId: string;
    userId: UserId;
    roomId?: string;
};
