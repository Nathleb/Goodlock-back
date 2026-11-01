import { typeErrorsOf } from './typeErrors';

describe('typeErrorsOf', () => {
    let errors: Record<string, string[]>;

    beforeAll(() => {
        errors = typeErrorsOf({
            valid: `import { RoomId } from '@shared/branded.types';\nconst room: RoomId = 'r1' as RoomId;\nexport {};`,
            wrongType: `const n: number = 'text';\nexport {};`,
            unknownImport: `import { Nope } from '@shared/branded.types';\nexport {};`,
        });
    }, 60_000);

    it('returns no error for code that compiles with the project paths', () => {
        expect(errors.valid).toEqual([]);
    });

    it('returns the compiler message of a type error', () => {
        expect(errors.wrongType).toEqual([expect.stringContaining("Type 'string' is not assignable to type 'number'")]);
    });

    it('reports an import the project does not export', () => {
        expect(errors.unknownImport).toEqual([expect.stringContaining('has no exported member')]);
    });
});
