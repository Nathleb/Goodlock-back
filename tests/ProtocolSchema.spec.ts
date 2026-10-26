import { readFileSync } from 'fs';
import { join } from 'path';
import { generateProtocolSchema } from '../scripts/protocol-schema';

const committedPath = join(__dirname, '..', 'protocol', 'protocol.schema.json');

type SchemaDefinition = { properties?: Record<string, unknown>; additionalProperties?: boolean };

describe('protocol schema', () => {
    const generated = generateProtocolSchema();
    const definitions = generated.definitions as unknown as Record<string, SchemaDefinition>;

    it('is up to date: run `npm run protocol:schema` after changing ServerEvents or a DTO', () => {
        const committed = JSON.parse(readFileSync(committedPath, 'utf8'));

        expect(committed).toEqual(generated);
    });

    it('describes every server event as a property of ServerEvents', () => {
        const events = definitions.ServerEvents.properties;

        expect(Object.keys(events).sort()).toEqual([
            'error',
            'gameOver',
            'gameStateUpdated',
            'presenceChanged',
            'roomCreated',
            'roomUpdated',
            'roundResolved',
            'sessionEvicted',
            'sessionStarted',
        ]);
    });

    it('keeps null in nullable fields, whatever the app tsconfig says about strict null checks', () => {
        const afk = definitions.GameStateUpdatePayload.properties.afkClaimInMs;

        expect(JSON.stringify(afk)).toContain('"null"');
    });

    it('rejects unknown properties', () => {
        expect(definitions.ErrorPayload.additionalProperties).toBe(false);
    });
});
