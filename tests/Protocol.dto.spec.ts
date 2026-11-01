import { ServerEvents } from '@application/dtos/Protocol.dto';
import { typeErrorsOf } from './helpers/typeErrors';

describe('ServerEvents', () => {
    it('types each event with its payload', () => {
        const error: ServerEvents['error'] = { code: 'NOT_CONNECTED', message: 'Not connected' };
        const started: ServerEvents['sessionStarted'] = { sessionId: 's1' };
        const evicted: ServerEvents['sessionEvicted'] = { reason: 'signed-in-elsewhere' };
        const gameOver: ServerEvents['gameOver'] = { winner: 'draw', reason: 'forfeit' };
        const presence: ServerEvents['presenceChanged'] = { playerIndex: 0, connected: false, claimInMs: 5000 };

        expect([error, started, evicted, gameOver, presence]).toHaveLength(5);
    });

    it('rejects a payload that does not match its event', () => {
        const prelude = `import { ServerEvents } from '@application/dtos/Protocol.dto';\n`;

        const errors = typeErrorsOf({
            valid: prelude + `export const ok: ServerEvents['sessionStarted'] = { sessionId: 's1' };`,
            missingFields: prelude + `export const bad: ServerEvents['roundResolved'] = { wrong: 1 };`,
            wrongField: prelude + `export const worse: ServerEvents['sessionStarted'] = { message: 'x' };`,
            missingCode: prelude + `export const uncoded: ServerEvents['error'] = { message: 'x' };`,
        });

        expect(errors.valid).toEqual([]);
        expect(errors.missingFields).toEqual([expect.stringContaining("'wrong' does not exist in type 'RoundResolvedDTO'")]);
        expect(errors.wrongField).toEqual([expect.stringContaining("'message' does not exist in type 'SessionStartedDTO'")]);
        expect(errors.missingCode).toEqual([expect.stringContaining("Property 'code' is missing")]);
    }, 60_000);

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
