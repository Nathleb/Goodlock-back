import { SessionService } from "@domain/services/Session.service";
import { SessionManager } from "@infrastructure/adapters/managers/session.manager";

describe('SessionService', () => {
    let sessionService: SessionService;
    let sessionManager: SessionManager;

    beforeEach(() => {
        sessionManager = new SessionManager();
        sessionService = new SessionService(sessionManager);
    });

    it('should create or reconnect a session', () => {
        const socketId = "socket123";
        const deviceIdentifier = "device123";
        const session = sessionService.createOrReconnectSession(socketId, deviceIdentifier);
        expect(session.socketId).toBe(socketId);
        expect(session.deviceIdentifier).toBe(deviceIdentifier);
    });

    it('should get a session by socketId', () => {
        const socketId = "socket123";
        const deviceIdentifier = "device123";
        sessionService.createOrReconnectSession(socketId, deviceIdentifier);
        const session = sessionService.getSession(socketId);
        expect(session?.socketId).toBe(socketId);
    });

    it('should disconnect a session', () => {
        const socketId = "socket123";
        const deviceIdentifier = "device123";
        sessionService.createOrReconnectSession(socketId, deviceIdentifier);
        sessionService.disconnectSession(socketId);
        const session = sessionService.getSession(socketId);
        expect(session?.isConnected).toBe(false);
    });

    it('should delete a session', () => {
        const socketId = "socket123";
        const deviceIdentifier = "device123";
        sessionService.createOrReconnectSession(socketId, deviceIdentifier);
        sessionService.deleteSession(socketId);
        const session = sessionService.getSession(socketId);
        expect(session).toBeUndefined();
    });
});
