import { TEST_CATALOG_ID, makeTestCatalog } from './helpers/catalog';
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CLAIM_CONFIG } from '@application/ports/tokens';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { SlotIndex } from '@domain/types/Position.type';
import GamePhase from '@domain/types/GamePhase.type';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { createGameState, buildEffectFactory } from '@domain/services/GameInit.service';
import { createPlayer } from '@domain/services/Player.service';
import { beginKeepPhase } from '@domain/services/Phase.service';
import { Player } from '@domain/types/Player.type';
import { UserId, CatalogId } from '@shared/branded.types';
import { EFFECT_FACTORY, CATALOG_PORT } from '@application/ports/tokens';
import GameState from '@domain/types/GameState.type';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SOCKET_0 = 'socket-0';
const SOCKET_1 = 'socket-1';
const USER_ID_0 = 'user-uuid-0' as UserId;
const USER_ID_1 = 'user-uuid-1' as UserId;
const SESSION_0: Session = { sessionId: 'p0', socketId: SOCKET_0, userId: USER_ID_0, roomId: 'room-1' };
const SESSION_1: Session = { sessionId: 'p1', socketId: SOCKET_1, userId: USER_ID_1, roomId: 'room-1' };

const factory = buildEffectFactory();
const catalog = makeTestCatalog(10);

const die = generateFullDie([
    { description: 'A', priority: 1, effects: [] },
    { description: 'B', priority: 1, effects: [] },
    { description: 'C', priority: 1, effects: [] },
    { description: 'D', priority: 1, effects: [] },
    { description: 'E', priority: 1, effects: [] },
    { description: 'F', priority: 1, effects: [] },
] satisfies BaseDieInstructions, factory);

const makeTeam = (pi: 0 | 1): Player =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

const baseGs = createGameState(makeTeam(0), makeTeam(1));
const keepGs  = beginKeepPhase(baseGs);

const p0Ready = (gs: typeof baseGs) => ({ ...gs, playersReady: [true, false] as [boolean, boolean] });
const p1Ready = (gs: typeof baseGs) => ({ ...gs, playersReady: [false, true] as [boolean, boolean] });

const withDeadEnemies = (gs: typeof baseGs) => ({
    ...gs,
    players: [gs.players[0], { ...gs.players[1], team: gs.players[1].team.map((c, i) => i < 3 ? { ...c, hp: 0 } : c) }] as [Player, Player],
});

const makeRoom = (gameState: typeof baseGs): Room => ({
    roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: true, gameState,
});

const DECK_P0 = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as CatalogId[];
const DECK_P1 = ['c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] as CatalogId[];
const lobbyRoom: Room = { roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: false, deckSelections: { p0: DECK_P0, p1: DECK_P1 } };
const singlePlayerRoom: Room = { ...lobbyRoom, playersId: ['p0'] };

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSession = { getSession: jest.fn(), getSessionById: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom    = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), setPresence: jest.fn(), listOpenRooms: jest.fn() };
const mockWs      = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };

let coordinator: GameCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            GameCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: EFFECT_FACTORY, useValue: factory },
            { provide: CATALOG_PORT, useValue: catalog },
            { provide: CLAIM_CONFIG, useValue: { graceMs: 60_000, afkLimitMs: 120_000 } },
        ],
    }).compile();
    coordinator = module.get(GameCoordinatorService);
    // Default: player 0 acting, room has a game in PLACEMENT
    mockSession.getSession.mockReturnValue(SESSION_0);
    mockRoom.getRoom.mockReturnValue(makeRoom(baseGs));
});

// ── No-context guards ────────────────────────────────────────────────────────

describe('context guards (tested via rearrangeTeam)', () => {
    it('emits error when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when session has no roomId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, roomId: undefined });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when room is not found', () => {
        mockRoom.getRoom.mockReturnValue(undefined);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when room has no game state', () => {
        mockRoom.getRoom.mockReturnValue(lobbyRoom);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when sessionId is not in room.playersId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, sessionId: 'unknown' });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

// ── startGame ────────────────────────────────────────────────────────────────

describe('startGame', () => {
    beforeEach(() => {
        mockRoom.getRoom.mockReturnValue(lobbyRoom);
    });

    it('does nothing when session has no roomId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, roomId: undefined });
        coordinator.startGame(SOCKET_0);
        expect(mockRoom.startGame).not.toHaveBeenCalled();
    });

    it('emits error when caller is not the room owner', () => {
        mockSession.getSession.mockReturnValue(SESSION_1);
        coordinator.startGame(SOCKET_1);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_1, 'error', expect.anything());
        expect(mockRoom.startGame).not.toHaveBeenCalled();
    });

    it('emits error when room is not ready (only 1 player)', () => {
        mockRoom.getRoom.mockReturnValue(singlePlayerRoom);
        coordinator.startGame(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('starts the game and emits a per-viewer masked state to each player socket', () => {
        mockRoom.startGame.mockReturnValue({ ...lobbyRoom, isStarted: true });
        mockSession.getSessionById.mockImplementation((id: string) =>
            id === 'p0' ? SESSION_0 : id === 'p1' ? SESSION_1 : undefined);
        coordinator.startGame(SOCKET_0);
        expect(mockRoom.startGame).toHaveBeenCalledWith('room-1', expect.anything());
        // Each player gets their own placement view (own team real, enemy masked).
        // No room-wide broadcast — that would leak the opponent's real order.
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_1, 'gameStateUpdated', expect.anything());
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('opens team preview: SELECTION with both chosen decks, no teams yet', () => {
        coordinator.startGame(SOCKET_0);
        const state: GameState = mockRoom.startGame.mock.calls[0][1];
        expect(state.phase).toBe(GamePhase.SELECTION);
        expect(state.selection?.decks[0].map(t => t.id)).toEqual(DECK_P0);
        expect(state.selection?.decks[1].map(t => t.id)).toEqual(DECK_P1);
        expect(state.players.map(p => p.team.length)).toEqual([0, 0]);
    });

    it('sends each player a selection view with both decks', () => {
        mockRoom.startGame.mockReturnValue({ ...lobbyRoom, isStarted: true });
        mockSession.getSessionById.mockImplementation((id: string) =>
            id === 'p0' ? SESSION_0 : id === 'p1' ? SESSION_1 : undefined);
        coordinator.startGame(SOCKET_0);
        const toP1 = mockWs.emitToSocket.mock.calls.find(c => c[0] === SOCKET_1)?.[2];
        expect(toP1.phase).toBe('SELECTION_PHASE');
        expect(toP1.selection.decks[0].map((c: { id: string }) => c.id)).toEqual(DECK_P0);
        expect(toP1.selection.myPicks).toBeNull();
    });

    it('emits error until both players have chosen a deck', () => {
        mockRoom.getRoom.mockReturnValue({ ...lobbyRoom, deckSelections: { p0: DECK_P0 } });
        coordinator.startGame(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Both players must choose a deck' });
        expect(mockRoom.startGame).not.toHaveBeenCalled();
    });

    it('emits error when a chosen deck references a character the catalog does not have', () => {
        mockRoom.getRoom.mockReturnValue({ ...lobbyRoom, deckSelections: { p0: DECK_P0, p1: [...DECK_P1.slice(0, 6), 'ghost' as CatalogId] } });
        coordinator.startGame(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.startGame).not.toHaveBeenCalled();
    });
});

// ── rearrangeTeam ────────────────────────────────────────────────────────────

describe('rearrangeTeam', () => {
    const validIds = () => baseGs.players[0].team.map(c => c.id);

    it('emits error when not in PLACEMENT phase', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.rearrangeTeam(SOCKET_0, validIds());
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when fewer than 5 IDs are provided', () => {
        coordinator.rearrangeTeam(SOCKET_0, validIds().slice(0, 4));
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when duplicate IDs are provided', () => {
        const ids = validIds();
        ids[4] = ids[0];
        coordinator.rearrangeTeam(SOCKET_0, ids);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when an unknown character ID is provided', () => {
        const ids = validIds();
        ids[4] = 'unknown-id';
        coordinator.rearrangeTeam(SOCKET_0, ids);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('saves state and echoes masked gameStateUpdated to the acting socket only', () => {
        coordinator.rearrangeTeam(SOCKET_0, validIds().reverse());
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        // The actor must receive the persisted order back, otherwise the
        // prop-controlled client reverts the drag. Opponent gets nothing —
        // placement arrangement stays secret.
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

// ── confirmPlacement ─────────────────────────────────────────────────────────

describe('confirmPlacement', () => {
    it('saves state and emits masked gameStateUpdated to socket when first to confirm', () => {
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('auto-rolls and emits gameStateUpdated in KEEP phase when both confirm', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(baseGs)));
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });
});

// ── confirmKeep ───────────────────────────────────────────────────────────────

describe('confirmKeep', () => {
    beforeEach(() => mockRoom.getRoom.mockReturnValue(makeRoom(keepGs)));

    it('echoes the confirming player\'s own ready state to their socket when first to confirm', () => {
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(
            SOCKET_0, 'gameStateUpdated', expect.objectContaining({ playersReady: [true, false] }),
        );
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('rerolls and emits gameStateUpdated still in KEEP when both confirm with rollsLeft > 0', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(keepGs)));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });

    it('resolves the round when both confirm with rollsLeft = 0: roundResolved then next-round gameStateUpdated', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready({ ...keepGs, rollsLeft: 0 })));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.objectContaining({ resolveLog: expect.any(Array) }));
        const events = mockWs.emitToRoom.mock.calls.map(([, event]) => event);
        expect(events).toEqual(['roundResolved', 'gameStateUpdated']);
        expect(mockWs.emitToRoom).toHaveBeenLastCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP, rollsLeft: 2 }));
    });

    it('resolves the round when both confirm with every die locked', () => {
        const allLocked = (p: Player): Player => ({ ...p, team: p.team.map(c => ({ ...c, isFaceLocked: true })) });
        const locked = { ...keepGs, players: [keepGs.players[0], allLocked(keepGs.players[1])] as [Player, Player] };
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(locked)));
        coordinator.confirmKeep(SOCKET_0, keepGs.players[0].team.map(c => c.id));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.anything());
    });

    it('resolves then emits gameOver last when a winner is found', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(withDeadEnemies(p1Ready({ ...keepGs, rollsLeft: 0 }))));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 0, reason: 'elimination' });
        const events = mockWs.emitToRoom.mock.calls.map(([, event]) => event);
        expect(events[events.length - 1]).toBe('gameOver');
    });

    it('emits error when lockedCharacterIds contains unknown id', () => {
        coordinator.confirmKeep(SOCKET_0, ['unknown-id']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('accepts empty array (no characters locked)', () => {
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).toHaveBeenCalled();
    });

    it('accepts all 5 characters locked', () => {
        const allIds = keepGs.players[0].team.map(c => c.id);
        coordinator.confirmKeep(SOCKET_0, allIds);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).toHaveBeenCalled();
    });

    it('sets isFaceLocked=true only for locked characters and false for the rest', () => {
        const firstId = keepGs.players[0].team[0].id;
        coordinator.confirmKeep(SOCKET_0, [firstId]);
        const savedGs = mockRoom.updateGameState.mock.calls[0][1];
        expect(savedGs.players[0].team[0].isFaceLocked).toBe(true);
        expect(savedGs.players[0].team[1].isFaceLocked).toBe(false);
        expect(savedGs.players[0].team[2].isFaceLocked).toBe(false);
    });
});

// ── double-confirm guards ────────────────────────────────────────────────────

describe('double-confirm guards', () => {
    it('emits error on second confirmPlacement', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error on second confirmKeep', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

describe('post-confirm mutation guards', () => {
    it('emits error when rearrangeTeam called after confirmPlacement', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.rearrangeTeam(SOCKET_0, ['id0', 'id1', 'id2', 'id3', 'id4']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });


});

describe('cancelPlacement', () => {
    it('resets ready state and emits masked gameStateUpdated to socket when confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.cancelPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('does not save when not confirmed (no-op)', () => {
        coordinator.cancelPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('emits error when not in PLACEMENT phase', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.cancelPlacement(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

describe('cancelKeep', () => {
    it('resets ready state silently when confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
        coordinator.cancelKeep(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('does not save when not confirmed (no-op)', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.cancelKeep(SOCKET_0);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('emits error when not in KEEP phase', () => {
        coordinator.cancelKeep(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});
