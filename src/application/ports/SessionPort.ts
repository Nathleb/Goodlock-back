import { Session } from '@domain/types/Session.type';

export interface SessionPort {
    getSession(socketId: string): Session | undefined;
    createSession(socketId: string, deviceIdentifier: string): Session;
    reconnectSessionByDeviceIdentifier(socketId: string, deviceIdentifier: string): Session;
    deleteSession(socketId: string): void;
    updateSessionRoom(sessionId: string, roomId: string): Session;
    disconnectSession(socketId: string): void;
}
