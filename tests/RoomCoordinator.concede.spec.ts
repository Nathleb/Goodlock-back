import { P0, P1, asRoom } from './helpers/ids';
import { SocketId } from '@shared/branded.types';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';

const SOCKET = 'sock-0' as SocketId;

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), setPresence: jest.fn(), listOpenRooms: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };

function gs(phase: GamePhase): GameState {
    return { phase, currentRound: 1, initiativePlayerIndex: 0, rollsLeft: 2, playersReady: [false, false], priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
}

const STARTED: Room = {
    roomId: asRoom('room-1'), ownerId: P0, playersId: [P0, P1], isStarted: true,
    playerOrder: [P0, P1],
    presence: [{ connected: true, disconnectedAt: null }, { connected: true, disconnectedAt: null }],
    phaseStartedAt: 0, gameState: gs(GamePhase.KEEP),
};

let coordinator: RoomCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            RoomCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: DeckCoordinatorService, useValue: {} },
        ],
    }).compile();
    coordinator = module.get(RoomCoordinatorService);
    mockSession.getSession.mockReturnValue({ sessionId: P0, socketId: SOCKET, userId: 'u', roomId: asRoom('room-1') });
});

describe('quitRoom on a started game', () => {
    it('emits gameOver concede for the opponent and marks the quitter disconnected', () => {
        mockRoom.getRoom.mockReturnValue(STARTED);
        mockRoom.quitRoom.mockReturnValue(STARTED);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 1, reason: 'concede' });
        expect(mockRoom.updateGameState).toHaveBeenCalledWith('room-1', expect.objectContaining({ phase: GamePhase.RESULT }));
        expect(mockRoom.setPresence).toHaveBeenCalledWith('room-1', 0, false, expect.any(Number));
        expect(mockRoom.quitRoom).toHaveBeenCalledWith(P0);
    });

    it('does not emit gameOver when the game is already in RESULT', () => {
        mockRoom.getRoom.mockReturnValue({ ...STARTED, gameState: gs(GamePhase.RESULT) });
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.emitToRoom).not.toHaveBeenCalledWith('room-1', 'gameOver', expect.anything());
    });

    it('does not emit gameOver for lobby rooms', () => {
        mockRoom.getRoom.mockReturnValue({ roomId: asRoom('room-1'), ownerId: P0, playersId: [P0], isStarted: false });
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.emitToRoom).not.toHaveBeenCalledWith('room-1', 'gameOver', expect.anything());
    });
});
