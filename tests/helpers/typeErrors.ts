import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');

function projectOptions(): ts.CompilerOptions {
    const parsed = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, 'tsconfig.json'), {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
            throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
        },
    });
    return { ...parsed!.options, noEmit: true, incremental: false };
}

/**
 * Compiles each snippet as its own module with the project tsconfig (paths included) and returns
 * its type errors. Type tests use it to prove that the compiler refuses a call, without
 * suppression comments.
 */
export function typeErrorsOf(snippets: Record<string, string>): Record<string, string[]> {
    const files = new Map(Object.entries(snippets).map(([name, code]) => [path.join(ROOT, 'tests', `__typing_${name}.ts`), code]));
    const options = projectOptions();
    const host = ts.createCompilerHost(options);
    const { getSourceFile, fileExists, readFile } = host;
    host.getSourceFile = (fileName, language, ...rest) =>
        files.has(fileName) ? ts.createSourceFile(fileName, files.get(fileName)!, language) : getSourceFile(fileName, language, ...rest);
    host.fileExists = (fileName) => files.has(fileName) || fileExists(fileName);
    host.readFile = (fileName) => files.get(fileName) ?? readFile(fileName);

    const program = ts.createProgram([...files.keys()], options, host);
    return Object.fromEntries(
        Object.keys(snippets).map((name) => {
            const source = program.getSourceFile(path.join(ROOT, 'tests', `__typing_${name}.ts`))!;
            const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
            return [name, diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))];
        }),
    );
}
