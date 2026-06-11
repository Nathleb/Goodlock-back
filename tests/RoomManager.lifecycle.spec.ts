import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';

function gs(phase: GamePhase, rollsLeft: number): GameState {
    return { phase, currentRound: 1, rollsLeft, playersReady: [false, false], priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
}

function startedRoom(manager: RoomManager): string {
    const room = manager.createRoom('p0');
    manager.joinRoom('p1', room.roomId);
    manager.startGame(room.roomId, gs(GamePhase.PLACEMENT, 2));
    return room.roomId;
}

describe('phaseStartedAt stamping', () => {
    it('stamps on startGame', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        expect(manager.getRoom(roomId)!.phaseStartedAt).toEqual(expect.any(Number));
    });

    it('re-stamps on phase change, not on same-phase same-rolls updates', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        jest.spyOn(Date, 'now').mockReturnValue(111_111);
        manager.updateGameState(roomId, gs(GamePhase.PLACEMENT, 2));
        expect(manager.getRoom(roomId)!.phaseStartedAt).not.toBe(111_111);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 2));
        expect(manager.getRoom(roomId)!.phaseStartedAt).toBe(111_111);
        jest.restoreAllMocks();
    });

    it('re-stamps on rollsLeft change within KEEP (reroll sub-round)', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 2));
        jest.spyOn(Date, 'now').mockReturnValue(222_222);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 1));
        expect(manager.getRoom(roomId)!.phaseStartedAt).toBe(222_222);
        jest.restoreAllMocks();
    });
});

describe('setPresence', () => {
    it('updates presence and returns the updated room', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        const updated = manager.setPresence(roomId, 1, false, 5000);
        expect(updated!.presence![1]).toEqual({ connected: false, disconnectedAt: 5000 });
        expect(manager.getRoom(roomId)!.presence![1].connected).toBe(false);
    });

    it('returns undefined for unknown rooms', () => {
        expect(new RoomManager().setPresence('nope', 0, false, 0)).toBeUndefined();
    });
});

describe('sweepAbandonedRooms', () => {
    it('deletes started rooms where all players are disconnected past the threshold', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.setPresence(roomId, 0, false, 1000);
        manager.setPresence(roomId, 1, false, 2000);
        expect(manager.sweepAbandonedRooms(2000 + 600_000, 600_000)).toEqual([roomId]);
        expect(manager.getRoom(roomId)).toBeUndefined();
    });

    it('keeps rooms where any player is connected or within the threshold', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.setPresence(roomId, 0, false, 1000);
        expect(manager.sweepAbandonedRooms(700_000, 600_000)).toEqual([]);
        expect(manager.getRoom(roomId)).toBeDefined();
    });

    it('ignores lobby rooms (no presence)', () => {
        const manager = new RoomManager();
        manager.createRoom('p0');
        expect(manager.sweepAbandonedRooms(Number.MAX_SAFE_INTEGER, 0)).toEqual([]);
    });
});
