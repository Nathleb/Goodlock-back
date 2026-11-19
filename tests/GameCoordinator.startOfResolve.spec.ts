import { P0, P1, asRoom } from './helpers/ids';
import { makeTestCatalog, TEST_CATALOG_ID } from './helpers/catalog';
import { createGameState } from './helpers/gameState';
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CATALOG_PORT, MATCH_TIMER_PORT } from '@application/ports/tokens';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { MatchLifecycleService } from '@application/services/MatchLifecycle.service';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { Session } from '@application/dtos/Session.dto';
import { RoundResolvedDTO } from '@application/dtos/Protocol.dto';
import * as GameLoop from '@domain/services/GameLoop.service';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { createPlayer } from '@domain/services/Player.service';
import { beginKeepPhase } from '@domain/services/Phase.service';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import EffectLabel from '@domain/types/EffectLabels.type';
import GamePhase from '@domain/types/GamePhase.type';
import GameState from '@domain/types/GameState.type';
import { Player } from '@domain/types/Player.type';
import { SlotIndex } from '@domain/types/Position.type';
import { Room } from '@domain/types/Room.type';
import { SocketId, UserId } from '@shared/branded.types';

const SOCKET_0 = 'socket-0' as SocketId;
const SESSION_0: Session = { sessionId: P0, socketId: SOCKET_0, userId: 'user-0' as UserId, roomId: asRoom('room-1') };

// Every face hits the enemy in front, but the last one heals instead: a face rolled at the last Roll
// is told apart from the face the character had before it.
const hit = { targets: [{ side: 'ENEMY', mode: 'ABSOLUTE', n: [0] }], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] };
const heal = { targets: [{ side: 'ALLY', mode: 'ABSOLUTE', n: [0] }], parts: [{ part: EffectLabel.Heal, magnitude: 1 }] };
const die = generateFullDie([
    { description: 'A', priority: 1, effects: [hit] },
    { description: 'B', priority: 1, effects: [hit] },
    { description: 'C', priority: 1, effects: [hit] },
    { description: 'D', priority: 1, effects: [hit] },
    { description: 'E', priority: 1, effects: [hit] },
    { description: 'F', priority: 1, effects: [heal] },
] as unknown as BaseDieInstructions);

const makeTeam = (pi: 0 | 1): Player =>
    createPlayer([0, 1, 2, 3].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

// The last Keep: player 1 has confirmed, player 0's confirm ends it.
const lastKeep: GameState = { ...beginKeepPhase(createGameState(makeTeam(0), makeTeam(1))), rollsLeft: 1, playersReady: [false, true] };
const room: Room = { roomId: asRoom('room-1'), ownerId: P0, playersId: [P0, P1], isStarted: true, gameState: lastKeep };

const mockSession = { getSession: jest.fn(), getSessionById: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), closeRoom: jest.fn(), listOpenRooms: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };
const mockTimer = { schedule: jest.fn(), cancel: jest.fn() };

let coordinator: GameCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            GameCoordinatorService,
            MatchLifecycleService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: CATALOG_PORT, useValue: makeTestCatalog(10) },
            { provide: MATCH_TIMER_PORT, useValue: mockTimer },
        ],
    }).compile();
    coordinator = module.get(GameCoordinatorService);
    mockSession.getSession.mockReturnValue(SESSION_0);
    mockRoom.getRoom.mockReturnValue(room);
});

afterEach(() => jest.restoreAllMocks());

describe('roundResolved carries the board Resolve started from', () => {
    let resolvedFrom: GameState;
    let payload: RoundResolvedDTO;

    beforeEach(() => {
        jest.spyOn(Math, 'random').mockReturnValue(0.99); // the last Roll gives every die its last face
        const performResolve = jest.spyOn(GameLoop, 'performResolve');

        coordinator.confirmKeep(SOCKET_0, []);

        resolvedFrom = performResolve.mock.calls[0][0];
        payload = mockWs.emitToRoom.mock.calls.find(([, event]) => event === 'roundResolved')![2];
    });

    it('is the state the round was resolved from, as both players see it', () => {
        expect(payload.startOfResolve).toEqual(GameStateMapper.toDTO(resolvedFrom));
    });

    it('is in the RESOLVE phase', () => {
        expect(payload.startOfResolve.phase).toBe(GamePhase.RESOLVE);
    });

    it('shows the faces of the last Roll, the ones the log resolves', () => {
        const firstAction = payload.resolveLog.find(step => !step.skipped)!;
        const actor = payload.startOfResolve.players.flatMap(p => p.team).find(c => c.id === firstAction.characterId)!;

        expect(actor.face.description).toBe('F');
        expect(firstAction.effects.map(e => e.parts)).toEqual(actor.face.effects.map(e => e.parts.map(p => p.part)));
    });
});
