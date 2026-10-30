/** Hexagonal layers: dependencies point inward only (see CLAUDE.md, Architecture). */
module.exports = {
  forbidden: [
    {
      name: 'domain-imports-no-other-layer',
      comment: 'domain is pure game logic: no application, no infrastructure.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(application|infrastructure)' },
    },
    {
      name: 'domain-imports-no-framework',
      comment: 'domain stays free of NestJS, Prisma and socket.io.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: 'node_modules/(@nestjs|@prisma|\\.prisma|socket\\.io)' },
    },
    {
      name: 'application-imports-no-infrastructure',
      comment: 'application defines ports; infrastructure implements them.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'application-imports-no-io-library',
      comment: 'application reaches the database and sockets only through ports.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: 'node_modules/(@prisma|\\.prisma|socket\\.io)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'A source file nothing imports is dead code.',
      severity: 'error',
      from: { orphan: true, pathNot: ['^src/main\\.ts$', '\\.d\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
