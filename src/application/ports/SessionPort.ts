import { Session } from '@application/dtos/Session.dto';

export interface SessionPort {
    createOrReconnectSession(socketId: string, deviceIdentifier: string): Session;
    getSession(socketId: string): Session | undefined;
    setSessionRoom(socketId: string, roomId: string | undefined): void;
    disconnectSession(socketId: string): void;
    deleteSession(socketId: string): void;
}
