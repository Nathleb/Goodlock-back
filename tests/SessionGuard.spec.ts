import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { SessionGuard } from '../src/infrastructure/adapters/websocket/guards/Session.guard';
import { SESSION_PORT } from '../src/application/ports/tokens';

const mockSessionPort = {
    getSession: jest.fn(),
    createOrReconnectSession: jest.fn(),
    setSessionRoom: jest.fn(),
    disconnectSession: jest.fn(),
    deleteSession: jest.fn(),
};

function makeContext(socketId: string): { ctx: ExecutionContext; emit: jest.Mock } {
    const emit = jest.fn();
    const ctx = {
        switchToWs: () => ({ getClient: () => ({ id: socketId, emit }) }),
    } as unknown as ExecutionContext;
    return { ctx, emit };
}

describe('SessionGuard', () => {
    let guard: SessionGuard;

    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                SessionGuard,
                { provide: SESSION_PORT, useValue: mockSessionPort },
            ],
        }).compile();
        guard = module.get(SessionGuard);
    });

    it('returns true when session exists', () => {
        mockSessionPort.getSession.mockReturnValue({ sessionId: 'p0', socketId: 'socket-0', userId: 'user-uuid-0' });
        const { ctx, emit } = makeContext('socket-0');
        expect(guard.canActivate(ctx)).toBe(true);
        expect(emit).not.toHaveBeenCalled();
    });

    it('throws a WsException and does not emit when session does not exist, so the filter is the only emitter', () => {
        mockSessionPort.getSession.mockReturnValue(undefined);
        const { ctx, emit } = makeContext('socket-0');
        expect(() => guard.canActivate(ctx)).toThrow(new WsException('Not connected'));
        expect(emit).not.toHaveBeenCalled();
    });
});
