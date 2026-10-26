import { writeFileSync } from 'fs';
import { join } from 'path';
import { createGenerator, Schema } from 'ts-json-schema-generator';

const root = join(__dirname, '..');

/** JSON Schema of `ServerEvents`: every event the server sends to clients, with its payload. */
export function generateProtocolSchema(): Schema {
    return createGenerator({
        path: join(root, 'src/application/dtos/Protocol.dto.ts'),
        // The app tsconfig turns strictNullChecks off, which would erase `| null` from the schema.
        tsconfig: join(root, 'tsconfig.protocol.json'),
        type: 'ServerEvents',
        additionalProperties: false,
        skipTypeCheck: true,
    }).createSchema('ServerEvents');
}

if (require.main === module) {
    const target = join(root, 'protocol', 'protocol.schema.json');
    writeFileSync(target, JSON.stringify(generateProtocolSchema(), null, 2) + '\n');
    console.log(`wrote ${target}`);
}
