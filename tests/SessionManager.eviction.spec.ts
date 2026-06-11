import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { UserId } from '@shared/branded.types';

const USER = 'user-1' as UserId;

describe('createOrReconnectSession eviction reporting', () => {
    it('reports no eviction for a brand-new session', () => {
        const manager = new SessionManager();
        const { session, evictedSocketId } = manager.createOrReconnectSession('sock-a', USER);
        expect(session.socketId).toBe('sock-a');
        expect(evictedSocketId).toBeNull();
    });

    it('reports the old socket when it is still live (duplicate login)', () => {
        const manager = new SessionManager();
        manager.createOrReconnectSession('sock-a', USER);
        const { evictedSocketId } = manager.createOrReconnectSession('sock-b', USER);
        expect(evictedSocketId).toBe('sock-a');
    });

    it('reports no eviction when the old socket already disconnected (normal reconnect)', () => {
        const manager = new SessionManager();
        manager.createOrReconnectSession('sock-a', USER);
        manager.disconnectSession('sock-a');
        const { session, evictedSocketId } = manager.createOrReconnectSession('sock-b', USER);
        expect(evictedSocketId).toBeNull();
        expect(session.socketId).toBe('sock-b');
    });

    it('preserves sessionId and roomId across reconnects', () => {
        const manager = new SessionManager();
        const first = manager.createOrReconnectSession('sock-a', USER).session;
        manager.setSessionRoom('sock-a', 'room-1');
        manager.disconnectSession('sock-a');
        const second = manager.createOrReconnectSession('sock-b', USER).session;
        expect(second.sessionId).toBe(first.sessionId);
        expect(second.roomId).toBe('room-1');
    });
});
