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

// The gateway is mounted for real (Nest pipes, filters and guards included) and driven by a
// socket.io client: calling the handlers directly would skip the validation under test.
const game = { confirmKeep: jest.fn(), confirmSelection: jest.fn() };
const room = { joinRoom: jest.fn(), selectDeck: jest.fn() };

let app: INestApplication;
let client: Socket;

const next = <T>(event: string): Promise<T> => new Promise((resolve) => client.once(event, resolve));
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        providers: [
            SessionGateway,
            SharedWebSocketService,
            { provide: SessionCoordinatorService, useValue: { handleConnect: jest.fn(), handleDisconnect: jest.fn() } },
            { provide: RoomCoordinatorService, useValue: room },
            { provide: GameCoordinatorService, useValue: game },
            { provide: JwtService, useValue: { verify: () => ({ sub: 'user-1' }) } },
            { provide: SESSION_PORT, useValue: { getSession: () => ({ sessionId: 's' }) } },
        ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    client = io(`http://localhost:${port}`, { auth: { token: 'token' }, transports: ['websocket'] });
    await next('connect');
});

afterAll(async () => {
    client.close();
    await app.close();
});

beforeEach(() => jest.clearAllMocks());

describe('SessionGateway — payload validation', () => {
    it('forwards a valid confirmKeep payload to the coordinator', async () => {
        client.emit('confirmKeep', { lockedCharacterIds: ['a', 'b'] });
        await settle();
        expect(game.confirmKeep).toHaveBeenCalledWith(expect.any(String), ['a', 'b']);
    });

    it('answers a confirmKeep payload that is not an array with an error event, without calling the coordinator', async () => {
        const error = next<{ message: string }>('error');
        client.emit('confirmKeep', { lockedCharacterIds: 'a' });
        expect((await error).message).toMatch(/lockedCharacterIds/);
        expect(game.confirmKeep).not.toHaveBeenCalled();
    });

    it('answers a confirmKeep with no payload at all with an error event', async () => {
        const error = next<{ message: string }>('error');
        client.emit('confirmKeep');
        expect(await error).toEqual({ message: expect.any(String) });
        expect(game.confirmKeep).not.toHaveBeenCalled();
    });

    it('answers a joinRoom whose roomId is not a string with an error event', async () => {
        const error = next<{ message: string }>('error');
        client.emit('joinRoom', { roomId: 42 });
        expect((await error).message).toMatch(/roomId/);
        expect(room.joinRoom).not.toHaveBeenCalled();
    });

    it('refuses properties the payload does not declare', async () => {
        const error = next<{ message: string }>('error');
        client.emit('confirmKeep', { lockedCharacterIds: ['a'], admin: true });
        expect((await error).message).toMatch(/admin/);
        expect(game.confirmKeep).not.toHaveBeenCalled();
    });
});
