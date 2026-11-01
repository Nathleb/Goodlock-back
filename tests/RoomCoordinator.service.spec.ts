import { P0, P1, asRoom, asSession } from './helpers/ids';
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';
import GamePhase from '@domain/types/GamePhase.type';
import { UserId, CatalogId, SocketId, DeckId } from '@shared/branded.types';
import { Logger, NotFoundException } from '@nestjs/common';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { domainError } from '@domain/errors/DomainError';
import { ok, err } from '@shared/result.type';

const SOCKET = 'socket-0' as SocketId;
const USER_ID = 'user-uuid-0' as UserId;
const SESSION: Session = { sessionId: P0, socketId: SOCKET, userId: USER_ID };
const SESSION_IN_ROOM: Session = { ...SESSION, roomId: asRoom('old-room') };

const ROOM: Room = { roomId: asRoom('room-1'), ownerId: P0, playersId: [P0, P1], isStarted: false };
const OLD_ROOM: Room = { roomId: asRoom('old-room'), ownerId: P0, playersId: [P0], isStarted: false };

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), setDeckSelection: jest.fn() };
const mockDecks = { getOwnDeckCharacterIds: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn() };

let coordinator: RoomCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            RoomCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: DeckCoordinatorService, useValue: mockDecks },
        ],
    }).compile();
    coordinator = module.get(RoomCoordinatorService);
});

describe('createRoom', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.createRoom(SOCKET);
        expect(mockRoom.createRoom).not.toHaveBeenCalled();
    });

    it('creates room and emits roomCreated to the creator', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.createRoom.mockReturnValue(ROOM);
        coordinator.createRoom(SOCKET);
        expect(mockRoom.createRoom).toHaveBeenCalledWith(P0);
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.joinRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'roomCreated', expect.anything());
    });

    it('leaves the old room before creating a new one', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        mockRoom.createRoom.mockReturnValue(ROOM);
        coordinator.createRoom(SOCKET);
        expect(mockRoom.quitRoom).toHaveBeenCalledWith(P0);
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'old-room');
        expect(mockRoom.createRoom).toHaveBeenCalled();
    });

    it('notifies the remaining player in the old room when leaving to create', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(OLD_ROOM);
        mockRoom.createRoom.mockReturnValue(ROOM);
        coordinator.createRoom(SOCKET);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('old-room', 'roomUpdated', expect.anything());
    });
});

describe('joinRoom', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.joinRoom(SOCKET, asRoom('room-1'));
        expect(mockRoom.joinRoom).not.toHaveBeenCalled();
    });

    it('joins room and emits roomUpdated to the whole room', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.joinRoom.mockReturnValue(ok(ROOM));
        coordinator.joinRoom(SOCKET, asRoom('room-1'));
        expect(mockRoom.joinRoom).toHaveBeenCalledWith(P0, 'room-1');
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.joinRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roomUpdated', expect.anything());
    });

    it('leaves the old room before joining a new one', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        mockRoom.joinRoom.mockReturnValue(ok(ROOM));
        coordinator.joinRoom(SOCKET, asRoom('room-1'));
        expect(mockRoom.quitRoom).toHaveBeenCalledWith(P0);
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'old-room');
        expect(mockRoom.joinRoom).toHaveBeenCalled();
    });

    it('reports the rule that refused the join, with its code', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.joinRoom.mockReturnValue(err(domainError('ROOM_NOT_FOUND', 'Room not found')));
        coordinator.joinRoom(SOCKET, asRoom('bad-room'));
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    });

    it('a refused join sends one error only and binds the session to no room', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.joinRoom.mockReturnValue(err(domainError('ROOM_FULL', 'Room is full')));
        coordinator.joinRoom(SOCKET, asRoom('room-1'));
        expect(mockWs.emitToSocket).toHaveBeenCalledTimes(1);
        expect(mockSession.setSessionRoom).not.toHaveBeenCalled();
        expect(mockWs.joinRoom).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

describe('createRoom and joinRoom, unexpected failure', () => {
    it('reports a thrown error to the client as INTERNAL, without binding the session', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.createRoom.mockImplementation(() => { throw new Error('boom'); });
        const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        coordinator.createRoom(SOCKET);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', expect.objectContaining({ code: 'INTERNAL' }));
        expect(mockSession.setSessionRoom).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalled();
        jest.restoreAllMocks();
    });
});

describe('quitRoom', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.quitRoom(SOCKET);
        expect(mockRoom.quitRoom).not.toHaveBeenCalled();
    });

    it('does nothing when session has no room', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        coordinator.quitRoom(SOCKET);
        expect(mockRoom.quitRoom).not.toHaveBeenCalled();
    });

    it('quits room and notifies remaining player', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(ROOM);
        coordinator.quitRoom(SOCKET);
        expect(mockRoom.quitRoom).toHaveBeenCalledWith(P0);
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'old-room');
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roomUpdated', expect.anything());
    });

    it('does not emit roomUpdated when the last player quits', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.leaveRoom).toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

describe('selectDeck', () => {
    const SIX = ['a', 'b', 'c', 'd', 'e', 'f'] as CatalogId[];
    const IN_ROOM: Session = { ...SESSION, roomId: asRoom('room-1') };

    beforeEach(() => {
        mockSession.getSession.mockReturnValue(IN_ROOM);
        mockDecks.getOwnDeckCharacterIds.mockResolvedValue(SIX);
        mockRoom.setDeckSelection.mockReturnValue(ok({ ...ROOM, deckSelections: { p0: SIX } }));
    });

    it("snapshots the player's deck in the room and tells the room who is ready", async () => {
        await coordinator.selectDeck(SOCKET, 'deck-1' as DeckId);
        expect(mockDecks.getOwnDeckCharacterIds).toHaveBeenCalledWith(USER_ID, 'deck-1');
        expect(mockRoom.setDeckSelection).toHaveBeenCalledWith('room-1', P0, SIX);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roomUpdated',
            expect.objectContaining({ players: expect.arrayContaining([expect.objectContaining({ playerId: P0, hasDeck: true })]) }));
    });

    it('errors when the player is not in a room', async () => {
        mockSession.getSession.mockReturnValue(SESSION);
        await coordinator.selectDeck(SOCKET, 'deck-1' as DeckId);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', { code: 'NOT_IN_ROOM', message: 'Join a room before choosing a deck' });
        expect(mockDecks.getOwnDeckCharacterIds).not.toHaveBeenCalled();
    });

    it("errors on a deck the player doesn't own, storing nothing", async () => {
        mockDecks.getOwnDeckCharacterIds.mockRejectedValue(new NotFoundException('Deck not found'));
        await coordinator.selectDeck(SOCKET, 'deck-x' as DeckId);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', { code: 'DECK_NOT_FOUND', message: 'Deck not found' });
        expect(mockRoom.setDeckSelection).not.toHaveBeenCalled();
    });

    it('stores nothing when the player left the room during the deck lookup', async () => {
        mockSession.getSession.mockReturnValueOnce(IN_ROOM).mockReturnValue(SESSION);
        await coordinator.selectDeck(SOCKET, 'deck-1' as DeckId);
        expect(mockRoom.setDeckSelection).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('reports an error when the game started during the deck lookup', async () => {
        mockRoom.setDeckSelection.mockReturnValue(err(domainError('GAME_ALREADY_STARTED', 'Game already started')));
        await coordinator.selectDeck(SOCKET, 'deck-1' as DeckId);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', { code: 'GAME_ALREADY_STARTED', message: 'Game already started' });
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

describe('guards and edges', () => {
    afterEach(() => jest.restoreAllMocks());

    const STARTED: Room = {
        ...ROOM, isStarted: true, playerOrder: [P0, P1],
        gameState: { phase: GamePhase.KEEP, currentRound: 1, initiativePlayerIndex: 0, rollsLeft: 2, playersReady: [false, false], priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] },
    };

    it('a socket without a session gets no answer at all, not even an error', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.createRoom(SOCKET);
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('leaving clears the room from the session', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION, roomId: asRoom('room-1') });
        mockRoom.getRoom.mockReturnValue(ROOM);
        mockRoom.quitRoom.mockReturnValue(ROOM);
        coordinator.quitRoom(SOCKET);
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET, undefined);
    });

    it('someone without a seat leaving a started room concedes nothing', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION, sessionId: asSession('stranger'), roomId: asRoom('room-1') });
        mockRoom.getRoom.mockReturnValue(STARTED);
        mockRoom.quitRoom.mockReturnValue(STARTED);
        coordinator.quitRoom(SOCKET);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalledWith('room-1', 'gameOver', expect.anything());
    });

    it('reports an unexpected failure while quitting as INTERNAL', () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        mockSession.getSession.mockReturnValue({ ...SESSION, roomId: asRoom('room-1') });
        mockRoom.getRoom.mockReturnValue(ROOM);
        mockRoom.quitRoom.mockImplementationOnce(() => { throw new Error('boom'); });
        coordinator.quitRoom(SOCKET);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', { code: 'INTERNAL', message: 'Internal error' });
    });

    it('selectDeck from a socket without a session does nothing', async () => {
        mockSession.getSession.mockReturnValue(undefined);
        await coordinator.selectDeck(SOCKET, 'deck-1' as DeckId);
        expect(mockDecks.getOwnDeckCharacterIds).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('selectDeck stores nothing and says nothing when the session ended during the deck lookup', async () => {
        mockSession.getSession.mockReturnValueOnce({ ...SESSION, roomId: asRoom('room-1') }).mockReturnValue(undefined);
        mockDecks.getOwnDeckCharacterIds.mockResolvedValue(['a']);
        await coordinator.selectDeck(SOCKET, 'deck-1' as DeckId);
        expect(mockRoom.setDeckSelection).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });
});
