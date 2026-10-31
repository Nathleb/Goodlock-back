import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { SessionGateway } from '@infrastructure/adapters/websocket/session.gateway';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { SESSION_PORT } from '@application/ports/tokens';
import { domainError } from '@domain/errors/DomainError';
import { Logger } from '@nestjs/common';

// The gateway is mounted for real (Nest pipes, filters and guards included) and driven by a
// socket.io client: calling the handlers directly would skip the validation under test.
const game = { confirmKeep: jest.fn(), confirmSelection: jest.fn() };
const room = { joinRoom: jest.fn(), selectDeck: jest.fn() };

let app: INestApplication;
let client: Socket;

const sessions = { getSession: jest.fn() };

const next = <T>(event: string): Promise<T> => new Promise((resolve) => client.once(event, resolve));
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        providers: [
            SessionGateway,
            SharedWebSocketService,
            { provide: SessionCoordinatorService, useValue: { handleConnect: jest.fn(), handleDisconnect: jest.fn() } },
            { provide: RoomCoordinatorService, useValue: room },
            { provide: GameCoordinatorService, useValue: game },
            { provide: JwtService, useValue: { verify: () => ({ sub: 'user-1' }) } },
            { provide: SESSION_PORT, useValue: sessions },
        ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    client = io(`http://localhost:${port}`, { auth: { token: 'token' }, transports: ['websocket'] });
    await next('connect');
});

afterAll(async () => {
    client?.close();
    await app?.close();
});

beforeEach(() => {
    jest.clearAllMocks();
    sessions.getSession.mockReturnValue({ sessionId: 's' });
});

afterEach(() => jest.restoreAllMocks());

describe('SessionGateway — payload validation', () => {
    it('forwards a valid confirmKeep payload to the coordinator', async () => {
        const forwarded = new Promise<void>((resolve) => game.confirmKeep.mockImplementationOnce(() => resolve()));
        client.emit('confirmKeep', { lockedCharacterIds: ['a', 'b'] });
        await forwarded;
        expect(game.confirmKeep).toHaveBeenCalledWith(expect.any(String), ['a', 'b']);
    });

    it('answers a confirmKeep payload that is not an array with an error event, without calling the coordinator', async () => {
        const error = next<{ code: string; message: string }>('error');
        client.emit('confirmKeep', { lockedCharacterIds: 'a' });
        const { code, message } = await error;
        expect(code).toBe('INVALID_REQUEST');
        expect(message).toMatch(/lockedCharacterIds/);
        expect(game.confirmKeep).not.toHaveBeenCalled();
    });

    it('answers a confirmKeep with no payload at all with an error event', async () => {
        const error = next<{ message: string }>('error');
        client.emit('confirmKeep');
        const { message } = await error;
        expect(message).not.toBe('Internal error');
        expect(message.length).toBeGreaterThan(0);
        expect(game.confirmKeep).not.toHaveBeenCalled();
    });

    it('answers a joinRoom whose roomId is not a string with an error event', async () => {
        const error = next<{ message: string }>('error');
        client.emit('joinRoom', { roomId: 42 });
        expect((await error).message).toMatch(/roomId/);
        expect(room.joinRoom).not.toHaveBeenCalled();
    });

    it('answers a message from a socket without a session with exactly one error event', async () => {
        sessions.getSession.mockReturnValue(undefined);
        const errors: { code: string; message: string }[] = [];
        const collect = (e: { code: string; message: string }) => errors.push(e);
        client.on('error', collect);
        client.emit('confirmKeep', { lockedCharacterIds: ['a'] });
        await settle();
        client.off('error', collect);
        expect(errors).toEqual([{ code: 'NOT_CONNECTED', message: 'Not connected' }]);
        expect(game.confirmKeep).not.toHaveBeenCalled();
    });

    it('forwards the code of a domain error thrown by a handler', async () => {
        game.confirmKeep.mockImplementationOnce(() => { throw domainError('WRONG_PHASE', 'Expected phase KEEP_PHASE, got ROLL_PHASE'); });
        const error = next<{ code: string; message: string }>('error');
        client.emit('confirmKeep', { lockedCharacterIds: [] });
        expect(await error).toEqual({ code: 'WRONG_PHASE', message: 'Expected phase KEEP_PHASE, got ROLL_PHASE' });
    });

    it('reports an unexpected throw as INTERNAL without its message', async () => {
        const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        game.confirmKeep.mockImplementationOnce(() => { throw new TypeError('secret detail'); });
        const error = next<{ code: string; message: string }>('error');
        client.emit('confirmKeep', { lockedCharacterIds: [] });
        expect(await error).toEqual({ code: 'INTERNAL', message: 'Internal error' });
        expect(logError).toHaveBeenCalled();
    });

    it('refuses properties the payload does not declare', async () => {
        const error = next<{ message: string }>('error');
        client.emit('confirmKeep', { lockedCharacterIds: ['a'], admin: true });
        expect((await error).message).toMatch(/admin/);
        expect(game.confirmKeep).not.toHaveBeenCalled();
    });
});
