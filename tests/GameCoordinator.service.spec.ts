import { TEST_CATALOG_ID, makeTestCatalog } from './helpers/catalog';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CLAIM_CONFIG } from '@application/ports/tokens';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { SlotIndex } from '@domain/types/Position.type';
import GamePhase from '@domain/types/GamePhase.type';
import { createCharacter, generateFullDie, createCharacterFromTemplate } from '@domain/services/CharacterGeneration.service';
import { createSelectionState, confirmSelection } from '@domain/services/GameLoop.service';
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
    createPlayer([0, 1, 2, 3].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

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

const DECK_P0 = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'] as CatalogId[];
const DECK_P1 = ['c4', 'c5', 'c6', 'c7', 'c8', 'c9'] as CatalogId[];
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
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when session has no roomId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, roomId: undefined });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when room is not found', () => {
        mockRoom.getRoom.mockReturnValue(undefined);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when room has no game state', () => {
        mockRoom.getRoom.mockReturnValue(lobbyRoom);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when sessionId is not in room.playersId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, sessionId: 'unknown' });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', null]);
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
        mockRoom.getRoom.mockReturnValue({ ...lobbyRoom, deckSelections: { p0: DECK_P0, p1: [...DECK_P1.slice(0, 5), 'ghost' as CatalogId] } });
        coordinator.startGame(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.startGame).not.toHaveBeenCalled();
    });
});

// ── team selection ───────────────────────────────────────────────────────────

describe('team selection', () => {
    const PICK_P0 = ['c5', 'c0', 'c1', 'c2'];
    const PICK_P1 = ['c9', 'c8', 'c7', 'c6'];
    const selectingRoom = (gs: GameState): Room => ({ ...makeRoom(gs), playerOrder: ['p0', 'p1'] });
    const fresh = () => createSelectionState([
        DECK_P0.map(id => catalog.get(id)!),
        DECK_P1.map(id => catalog.get(id)!),
    ]);
    const lastState = (): GameState => mockRoom.updateGameState.mock.calls.at(-1)[1];
    const sentTo = (socket: string) => mockWs.emitToSocket.mock.calls.filter(c => c[0] === socket && c[1] === 'gameStateUpdated').map(c => c[2]);

    beforeEach(() => {
        mockRoom.getRoom.mockReturnValue(selectingRoom(fresh()));
        mockSession.getSessionById.mockImplementation((id: string) => id === 'p0' ? SESSION_0 : id === 'p1' ? SESSION_1 : undefined);
    });

    it('first confirm is echoed to the picker only', () => {
        coordinator.confirmSelection(SOCKET_0, PICK_P0);
        expect(lastState().selection?.picks[0]).toEqual(PICK_P0);
        expect(sentTo(SOCKET_0)[0].selection.myPicks).toEqual(PICK_P0);
        expect(sentTo(SOCKET_1)).toHaveLength(0);
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('second confirm starts PLACEMENT with a per-viewer view that hides the opponent', () => {
        mockRoom.getRoom.mockReturnValue(selectingRoom(confirmSelection(fresh(), 1, PICK_P1 as CatalogId[], t => createCharacterFromTemplate(t, factory))));
        coordinator.confirmSelection(SOCKET_0, PICK_P0);

        expect(lastState().phase).toBe(GamePhase.PLACEMENT);
        const toP0 = sentTo(SOCKET_0)[0];
        expect(toP0.players[0].team.map((c: { name: string }) => c.name)).toEqual(PICK_P0.map(id => `Name-${id}`));
        expect(toP0.players[1].team).toEqual([]);
        expect(JSON.stringify(toP0)).not.toContain('Name-c9');
        expect(sentTo(SOCKET_1)[0].players[0].team).toEqual([]);
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it("never sends a player the opponent's pick during SELECTION", () => {
        mockRoom.getRoom.mockReturnValue(selectingRoom(confirmSelection(fresh(), 0, PICK_P0 as CatalogId[], t => createCharacterFromTemplate(t, factory))));
        coordinator.cancelSelection(SOCKET_1); // no-op for p1, must not leak anything either
        coordinator.confirmSelection(SOCKET_1, ['c4', 'c5', 'c6', 'c7']);
        for (const payload of sentTo(SOCKET_1)) {
            expect(payload.selection?.myPicks ?? []).not.toEqual(PICK_P0);
            expect(JSON.stringify(payload)).not.toContain('"picks"');
        }
    });

    it.each([
        ['not an array', 'c0'],
        ['non-string ids', [1, 2, 3, 4, 5]],
        ['an invalid pick', ['c0', 'c0', 'c1', 'c2']],
    ])('emits error for %s', (_label, input) => {
        coordinator.confirmSelection(SOCKET_0, input as unknown as string[]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('cancelSelection outside SELECTION emits an error and changes nothing', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(baseGs)); // PLACEMENT
        coordinator.cancelSelection(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: expect.stringContaining('SELECTION_PHASE') });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('cancelSelection is silent when the player had not picked', () => {
        coordinator.cancelSelection(SOCKET_0);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('cancelSelection un-readies the player and echoes to them only', () => {
        mockRoom.getRoom.mockReturnValue(selectingRoom(confirmSelection(fresh(), 0, PICK_P0 as CatalogId[], t => createCharacterFromTemplate(t, factory))));
        coordinator.cancelSelection(SOCKET_0);
        expect(lastState().playersReady).toEqual([false, false]);
        expect(sentTo(SOCKET_0)[0].selection.myPicks).toBeNull();
        expect(sentTo(SOCKET_1)).toHaveLength(0);
    });
});

// ── rearrangeTeam ────────────────────────────────────────────────────────────

describe('rearrangeTeam', () => {
    const [a, b, c, d] = baseGs.players[0].team.map(ch => ch.id);
    const placedSlots = (): (string | null)[] => {
        const team = (mockRoom.updateGameState.mock.calls.at(-1)[1] as GameState).players[0].team;
        return [0, 1, 2, 3, 4].map(slot => team.find(ch => ch.position.slot === slot)?.id ?? null);
    };

    it('emits error when not in PLACEMENT phase', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.rearrangeTeam(SOCKET_0, [a, b, c, d, null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it.each([
        ['no empty cell', () => [a, b, c, d, a]],
        ['a duplicate', () => [a, a, c, d, null]],
        ['an unknown character ID', () => [a, b, c, 'unknown-id', null]],
        ['not an array', () => 'nope'],
    ])('emits error for %s, saving nothing', (_label, slots) => {
        coordinator.rearrangeTeam(SOCKET_0, slots() as unknown as (string | null)[]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('reports a wrong phase with its code', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.rearrangeTeam(SOCKET_0, [a, b, c, d, null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { code: 'WRONG_PHASE', message: expect.stringContaining('Expected phase') });
    });

    it('reports an invalid layout with its code', () => {
        coordinator.rearrangeTeam(SOCKET_0, [a, a, c, d, null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { code: 'INVALID_PLACEMENT', message: 'Duplicate character IDs in placement' });
    });

    it('hides an unexpected failure behind INTERNAL and does not leak its message', () => {
        const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        const bug = new TypeError('secret detail');
        mockRoom.updateGameState.mockImplementationOnce(() => { throw bug; });
        coordinator.rearrangeTeam(SOCKET_0, [d, null, c, b, a]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { code: 'INTERNAL', message: 'Internal error' });
        expect(logError).toHaveBeenCalledWith(bug);
        logError.mockRestore();
    });

    it('saves the layout, empty cell included, and echoes masked gameStateUpdated to the acting socket only', () => {
        coordinator.rearrangeTeam(SOCKET_0, [d, null, c, b, a]);
        expect(placedSlots()).toEqual([d, null, c, b, a]);
        // The actor must receive the persisted layout back, otherwise the
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

    it('emits an error instead of throwing when the locked ids are not an array', () => {
        const confirm = () => coordinator.confirmKeep(SOCKET_0, undefined as unknown as string[]);
        expect(confirm).not.toThrow();
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: expect.any(String) });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('refuses to lock a character of the opponent\'s team', () => {
        const opponentId = keepGs.players[1].team[0].id;
        coordinator.confirmKeep(SOCKET_0, [opponentId]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: `Unknown character id: ${opponentId}` });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
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

    describe('upkeep at the start of the next round', () => {
        const resolving = (gs: typeof baseGs) => p1Ready({ ...gs, rollsLeft: 0 });
        // VITALITY -1 touched during round 0: it survives this round's tick and hurts at the start of round 1.
        const poisoned = { VITALITY: { value: -1, touchedRound: 0 } };
        const edit = (gs: typeof baseGs, pi: 0 | 1, slot: number, change: Partial<Player['team'][number]>) => ({
            ...gs,
            players: gs.players.map((p, i) => i === pi ? { ...p, team: p.team.map((c, j) => j === slot ? { ...c, ...change } : c) } : p) as [Player, Player],
        });
        const lastEmittedState = () => {
            const calls = mockWs.emitToRoom.mock.calls.filter(([, event]) => event === 'gameStateUpdated');
            return calls[calls.length - 1][2];
        };

        it('POISON hurts in the state sent for the next round', () => {
            mockRoom.getRoom.mockReturnValue(makeRoom(resolving(edit(keepGs, 0, 1, { states: poisoned }))));

            coordinator.confirmKeep(SOCKET_0, []);

            expect(lastEmittedState().players[0].team[1].hp).toBe(95);
            expect(mockRoom.updateGameState).toHaveBeenLastCalledWith('room-1', expect.objectContaining({ phase: GamePhase.KEEP }));
        });

        it('a poison that expires at the end of this round does not hurt at the start of the next', () => {
            // VITALITY -1 touched in an earlier round: this round's tick removes it before the upkeep runs.
            const lastHit = { VITALITY: { value: -1, touchedRound: -1 } };
            mockRoom.getRoom.mockReturnValue(makeRoom(resolving(edit(keepGs, 0, 1, { states: lastHit }))));

            coordinator.confirmKeep(SOCKET_0, []);

            expect(lastEmittedState().players[0].team[1].hp).toBe(100);
        });

        it('ends the match when the poison kills the second character: gameOver, no next-round state', () => {
            const doomed = edit(edit(keepGs, 0, 0, { hp: 0 }), 0, 1, { hp: 5, states: poisoned });
            mockRoom.getRoom.mockReturnValue(makeRoom(resolving(doomed)));

            coordinator.confirmKeep(SOCKET_0, []);

            // The clients get the post-upkeep board before the result, so they see what decided the match.
            const events = mockWs.emitToRoom.mock.calls.map(([, event]) => event);
            expect(events).toEqual(['roundResolved', 'gameStateUpdated', 'gameOver']);
            expect(mockWs.emitToRoom).toHaveBeenLastCalledWith('room-1', 'gameOver', { winner: 1, reason: 'elimination' });
            expect(lastEmittedState().players[0].team[1].hp).toBe(0);
            expect(lastEmittedState().phase).toBe(GamePhase.RESULT);
        });

        it('saves the post-upkeep state when the poison ends the match, for a client that reconnects', () => {
            const doomed = edit(edit(keepGs, 0, 0, { hp: 0 }), 0, 1, { hp: 5, states: poisoned });
            mockRoom.getRoom.mockReturnValue(makeRoom(resolving(doomed)));

            coordinator.confirmKeep(SOCKET_0, []);

            const saved = mockRoom.updateGameState.mock.calls[mockRoom.updateGameState.mock.calls.length - 1][1];
            expect(saved.phase).toBe(GamePhase.RESULT);
            expect(saved.players[0].team[1].hp).toBe(0);
        });

        it('is a draw when the poison kills both players second characters', () => {
            const both = edit(edit(edit(edit(keepGs, 0, 0, { hp: 0 }), 0, 1, { hp: 5, states: poisoned }), 1, 0, { hp: 0 }), 1, 1, { hp: 5, states: poisoned });
            mockRoom.getRoom.mockReturnValue(makeRoom(resolving(both)));

            coordinator.confirmKeep(SOCKET_0, []);

            expect(mockWs.emitToRoom).toHaveBeenLastCalledWith('room-1', 'gameOver', { winner: 'draw', reason: 'elimination' });
        });

        it('does not touch the state when nobody is poisoned or regenerating', () => {
            mockRoom.getRoom.mockReturnValue(makeRoom(resolving(keepGs)));

            coordinator.confirmKeep(SOCKET_0, []);

            expect(lastEmittedState().players[0].team.map((c: { hp: number }) => c.hp)).toEqual([100, 100, 100, 100]);
        });
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
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { code: 'ALREADY_CONFIRMED', message: 'Player has already confirmed' });
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
        coordinator.rearrangeTeam(SOCKET_0, ['id0', 'id1', 'id2', 'id3', null]);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { code: 'ALREADY_CONFIRMED', message: 'Player has already confirmed' });
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
