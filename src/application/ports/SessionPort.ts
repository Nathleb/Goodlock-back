export interface SessionPort {
    getSession(socketId: string): unknown;
    createOrReconnectSession(socketId: string, deviceIdentifier: string): unknown;
    deleteSession(socketId: string): void;
    disconnectSession(socketId: string): void;
}
