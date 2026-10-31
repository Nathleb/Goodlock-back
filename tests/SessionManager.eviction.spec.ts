import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { UserId, SocketId } from '@shared/branded.types';

const USER = 'user-1' as UserId;
const SOCK_A = 'sock-a' as SocketId;
const SOCK_B = 'sock-b' as SocketId;

describe('createOrReconnectSession eviction reporting', () => {
    it('reports no eviction for a brand-new session', () => {
        const manager = new SessionManager();
        const { session, evictedSocketId } = manager.createOrReconnectSession(SOCK_A, USER);
        expect(session.socketId).toBe(SOCK_A);
        expect(evictedSocketId).toBeNull();
    });

    it('reports the old socket when it is still live (duplicate login)', () => {
        const manager = new SessionManager();
        manager.createOrReconnectSession(SOCK_A, USER);
        const { evictedSocketId } = manager.createOrReconnectSession(SOCK_B, USER);
        expect(evictedSocketId).toBe(SOCK_A);
    });

    it('reports no eviction when the old socket already disconnected (normal reconnect)', () => {
        const manager = new SessionManager();
        manager.createOrReconnectSession(SOCK_A, USER);
        manager.disconnectSession(SOCK_A);
        const { session, evictedSocketId } = manager.createOrReconnectSession(SOCK_B, USER);
        expect(evictedSocketId).toBeNull();
        expect(session.socketId).toBe(SOCK_B);
    });

    it('preserves sessionId and roomId across reconnects', () => {
        const manager = new SessionManager();
        const first = manager.createOrReconnectSession(SOCK_A, USER).session;
        manager.setSessionRoom(SOCK_A, 'room-1');
        manager.disconnectSession(SOCK_A);
        const second = manager.createOrReconnectSession(SOCK_B, USER).session;
        expect(second.sessionId).toBe(first.sessionId);
        expect(second.roomId).toBe('room-1');
    });

    it('does not evict itself when called twice with the same socket', () => {
        const manager = new SessionManager();
        manager.createOrReconnectSession(SOCK_A, USER);
        const { session, evictedSocketId } = manager.createOrReconnectSession(SOCK_A, USER);
        expect(evictedSocketId).toBeNull();
        expect(session.socketId).toBe(SOCK_A);
    });
});

describe('getSessionById', () => {
    it('resolves a session by its stable sessionId', () => {
        const manager = new SessionManager();
        const { session } = manager.createOrReconnectSession(SOCK_A, USER);
        expect(manager.getSessionById(session.sessionId)?.socketId).toBe(SOCK_A);
    });

    it('points at the current socket after a reconnect', () => {
        const manager = new SessionManager();
        const { session } = manager.createOrReconnectSession(SOCK_A, USER);
        manager.disconnectSession(SOCK_A);
        manager.createOrReconnectSession(SOCK_B, USER);
        expect(manager.getSessionById(session.sessionId)?.socketId).toBe(SOCK_B);
    });

    it('returns undefined for an unknown sessionId', () => {
        const manager = new SessionManager();
        expect(manager.getSessionById('nope')).toBeUndefined();
    });

    it('returns undefined after the session is deleted', () => {
        const manager = new SessionManager();
        const { session } = manager.createOrReconnectSession(SOCK_A, USER);
        manager.deleteSession(SOCK_A);
        expect(manager.getSessionById(session.sessionId)).toBeUndefined();
    });
});
