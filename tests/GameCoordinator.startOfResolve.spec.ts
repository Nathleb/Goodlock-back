import { P0, P1, asRoom } from './helpers/ids';
import { makeTestCatalog, TEST_CATALOG_ID } from './helpers/catalog';
import { createGameState } from './helpers/gameState';
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CATALOG_PORT, MATCH_TIMER_PORT, DICE_SOURCE } from '@application/ports/tokens';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { MatchLifecycleService } from '@application/services/MatchLifecycle.service';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { Session } from '@application/dtos/Session.dto';
import { RoundResolvedDTO } from '@application/dtos/Protocol.dto';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { createPlayer } from '@domain/services/Player.service';
import { beginKeepPhase } from '@domain/services/Phase.service';
import { INCREMENT_MS } from '@domain/services/Clock.service';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import Character from '@domain/types/Character.type';
import EffectLabel from '@domain/types/EffectLabels.type';
import GamePhase from '@domain/types/GamePhase.type';
import GameState, { PlayerClock } from '@domain/types/GameState.type';
import { Player } from '@domain/types/Player.type';
import { SlotIndex } from '@domain/types/Position.type';
import { Room } from '@domain/types/Room.type';
import { SocketId, UserId } from '@shared/branded.types';
import { ScriptedDiceSource } from '@infrastructure/adapters/dice/ScriptedDiceSource';

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
const roomWith = (gameState: GameState): Room => ({ roomId: asRoom('room-1'), ownerId: P0, playersId: [P0, P1], isStarted: true, gameState });

/** Each die after the last Roll: a kept one keeps its face, the others give their last face (the dice always land on the last face). */
const afterLastRoll = (c: Character): Character => c.isFaceLocked
    ? { ...c, keptAtLastRoll: true }
    : { ...c, face: c.baseDie[5], faceIndex: 5, keptAtLastRoll: false };

/**
 * The board Resolve starts from once both players have confirmed the last Keep at the instant the
 * Keep began (no time charged): no Roll left, nobody confirmed, both clocks given the increment and published.
 */
const resolveFrom = (keep: GameState): GameState => {
    const incremented = (c: PlayerClock): PlayerClock => ({ ...c, remainingMs: c.remainingMs + INCREMENT_MS, publishedMs: c.remainingMs + INCREMENT_MS });
    const rolled = (p: Player): Player => ({ ...p, team: p.team.map(afterLastRoll) });
    return {
        ...keep,
        phase: GamePhase.RESOLVE,
        rollsLeft: 0,
        playersReady: [false, false],
        clocks: [incremented(keep.clocks[0]), incremented(keep.clocks[1])],
        players: [rolled(keep.players[0]), rolled(keep.players[1])],
    };
};

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
            // The last Roll gives every free die its last face.
            { provide: DICE_SOURCE, useValue: ScriptedDiceSource.always('last') },
        ],
    }).compile();
    coordinator = module.get(GameCoordinatorService);
    mockSession.getSession.mockReturnValue(SESSION_0);
});

afterEach(() => jest.restoreAllMocks());

/** Player 0 confirms the last Keep of `keep`, keeping `kept`: the `roundResolved` sent to the room. */
function confirmLastKeep(keep: GameState, kept: string[] = []): RoundResolvedDTO {
    mockRoom.getRoom.mockReturnValue(roomWith(keep));
    jest.spyOn(Date, 'now').mockReturnValue(keep.clockUpdatedAt);
    coordinator.confirmKeep(SOCKET_0, kept);
    return mockWs.emitToRoom.mock.calls.find(([, event]) => event === 'roundResolved')![2];
}

describe('roundResolved carries the board Resolve started from', () => {
    let payload: RoundResolvedDTO;

    beforeEach(() => {
        payload = confirmLastKeep(lastKeep);
    });

    it('is the state the round was resolved from, as both players see it', () => {
        expect(payload.startOfResolve).toEqual(GameStateMapper.toDTO(resolveFrom(lastKeep)));
    });

    it('is in the RESOLVE phase', () => {
        expect(payload.startOfResolve.phase).toBe(GamePhase.RESOLVE);
    });

    it('ROLL-2: shows the faces of the last Roll, the ones the log resolves', () => {
        const firstAction = payload.resolveLog.find(step => !step.skipped)!;
        const actor = payload.startOfResolve.players.flatMap(p => p.team).find(c => c.id === firstAction.characterId)!;

        expect(actor.face.description).toBe('F');
        expect(firstAction.effects.map(e => e.parts)).toEqual(actor.face.effects.map(e => e.parts.map(p => p.part)));
    });
});

describe('ROLL-2: roundResolved shows which dice were kept at the last Roll', () => {
    it('marks as kept only the dice kept in the last Keep, on both sides', () => {
        // Player 1 confirmed earlier keeping its slot 2; player 0 now keeps its slot 0.
        const opponentKept = lastKeep.players[1].team[2].id;
        const keep: GameState = {
            ...lastKeep,
            players: [lastKeep.players[0], { ...lastKeep.players[1], team: lastKeep.players[1].team.map(c => ({ ...c, isFaceLocked: c.id === opponentKept })) }],
        };
        const ownKept = keep.players[0].team[0].id;

        const payload = confirmLastKeep(keep, [ownKept]);

        const kept = payload.startOfResolve.players.flatMap(p => p.team).filter(c => c.isFaceLocked).map(c => c.id);
        expect(kept.sort()).toEqual([ownKept, opponentKept].sort());
        expect(payload.startOfResolve.players.flatMap(p => p.team)).toHaveLength(8);
        const ownKeptDto = payload.startOfResolve.players[0].team.find(c => c.id === ownKept)!;
        expect(ownKeptDto.face.description).toBe('A');
    });
});
