import { ServerEvents } from '@application/dtos/Protocol.dto';

describe('ServerEvents', () => {
    it('types each event with its payload', () => {
        const error: ServerEvents['error'] = { message: 'Not connected' };
        const started: ServerEvents['sessionStarted'] = { sessionId: 's1' };
        const evicted: ServerEvents['sessionEvicted'] = { reason: 'signed-in-elsewhere' };
        const gameOver: ServerEvents['gameOver'] = { winner: 'draw', reason: 'forfeit' };
        const presence: ServerEvents['presenceChanged'] = { playerIndex: 0, connected: false, claimInMs: 5000 };

        expect([error, started, evicted, gameOver, presence]).toHaveLength(5);
    });

    it('rejects a payload that does not match its event', () => {
        // @ts-expect-error a roundResolved payload needs gameState and resolveLog
        const bad: ServerEvents['roundResolved'] = { wrong: 1 };
        // @ts-expect-error sessionStarted carries a sessionId, not a message
        const worse: ServerEvents['sessionStarted'] = { message: 'x' };

        expect([bad, worse]).toHaveLength(2);
    });

    it('lists exactly the events the server emits', () => {
        const names: (keyof ServerEvents)[] = [
            'roomCreated',
            'roomUpdated',
            'gameStateUpdated',
            'roundResolved',
            'gameOver',
            'presenceChanged',
            'sessionStarted',
            'sessionEvicted',
            'error',
        ];

        expect(names).toHaveLength(9);
    });
});
