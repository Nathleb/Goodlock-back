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

// Mounted for real and driven by socket.io clients: the event names in @SubscribeMessage and
// the JWT check of handleConnection are only exercised through a real connection.
const session = { handleConnect: jest.fn(), handleDisconnect: jest.fn() };
const room = { createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn() };
const game = { startGame: jest.fn(), confirmPlacement: jest.fn(), claimVictory: jest.fn(), cancelPlacement: jest.fn(), cancelKeep: jest.fn() };
const jwt = {
    verify: (token: string) => {
        if (token !== 'valid-token') throw new Error('invalid signature');
        return { sub: 'user-1' };
    },
};

let app: INestApplication;
let url: string;
const clients: Socket[] = [];

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

/** Connects and resolves once the server has either kept or dropped the socket. */
async function connect(auth: Record<string, unknown>): Promise<{ client: Socket; dropped: boolean }> {
    const client = io(url, { auth, transports: ['websocket'], reconnection: false });
    clients.push(client);
    let dropped = false;
    client.on('disconnect', () => { dropped = true; });
    await new Promise<void>((resolve) => client.once('connect', () => resolve()));
    await settle();
    return { client, dropped };
}

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        providers: [
            SessionGateway,
            SharedWebSocketService,
            { provide: SessionCoordinatorService, useValue: session },
            { provide: RoomCoordinatorService, useValue: room },
            { provide: GameCoordinatorService, useValue: game },
            { provide: JwtService, useValue: jwt },
            { provide: SESSION_PORT, useValue: { getSession: () => ({ sessionId: 's' }) } },
        ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}`;
});

afterAll(async () => {
    clients.forEach((c) => c.close());
    await app?.close();
});

beforeEach(() => jest.clearAllMocks());

describe('SessionGateway — connection', () => {
    it('drops a socket that sends no token, without opening a session', async () => {
        const { dropped } = await connect({});

        expect(dropped).toBe(true);
        expect(session.handleConnect).not.toHaveBeenCalled();
    });

    it('drops a socket whose token does not verify, without opening a session', async () => {
        const { dropped } = await connect({ token: 'forged-token' });

        expect(dropped).toBe(true);
        expect(session.handleConnect).not.toHaveBeenCalled();
    });

    it('opens the session of the token subject for a valid token, and keeps the socket', async () => {
        const { client, dropped } = await connect({ token: 'valid-token' });

        expect(dropped).toBe(false);
        expect(session.handleConnect).toHaveBeenCalledWith(client.id, 'user-1');
    });

    it('reports the socket to the session coordinator when it closes', async () => {
        const { client } = await connect({ token: 'valid-token' });
        const id = client.id;

        client.close();
        await settle();

        expect(session.handleDisconnect).toHaveBeenCalledWith(id);
    });
});

describe('SessionGateway — event wiring', () => {
    let client: Socket;

    beforeAll(async () => {
        ({ client } = await connect({ token: 'valid-token' }));
    });

    const events: [string, jest.Mock, unknown, unknown[]][] = [
        ['createRoom', room.createRoom, undefined, []],
        ['joinRoom', room.joinRoom, { roomId: 'room-1' }, ['room-1']],
        ['quitRoom', room.quitRoom, undefined, []],
        ['startGame', game.startGame, undefined, []],
        ['confirmPlacement', game.confirmPlacement, undefined, []],
        ['claimVictory', game.claimVictory, undefined, []],
        ['cancelPlacement', game.cancelPlacement, undefined, []],
        ['cancelKeep', game.cancelKeep, undefined, []],
    ];

    it.each(events)('%s reaches its coordinator method with the socket id', async (event, handler, payload, args) => {
        client.emit(event, payload);
        await settle();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(client.id, ...args);
    });
});
