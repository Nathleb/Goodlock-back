export type Session = {
    sessionId: string;
    socketId: string;
    isConnected: boolean;
    deviceIdentifier: string;
    inRoomId: string;
    pseudo: string;
    lastUpdate: Date;
}
