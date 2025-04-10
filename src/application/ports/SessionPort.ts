import { Session } from '@domain/types/Session.type';

export interface SessionPort {
    getSession(socketId: string): Session | undefined;
    createOrReconnectSession(socketId: string, deviceIdentifier: string): Session;
    deleteSession(socketId: string): void;
    updateSession(sessionId: string, updates: Partial<Session>): Session;
    disconnectSession(socketId: string): void;
}
