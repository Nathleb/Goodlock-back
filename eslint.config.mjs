import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Hexagonal layers: dependencies point inward only (see CLAUDE.md, Architecture).
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@application/*", "@infrastructure/*"], message: "domain must not import another layer." },
            { regex: "(^|/)(application|infrastructure)(/|$)", message: "domain must not import another layer." },
            { group: ["@nestjs/*", "@prisma/*", "socket.io"], message: "domain must stay free of framework and I/O." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@infrastructure/*"], message: "application must not import infrastructure." },
            { regex: "(^|/)infrastructure(/|$)", message: "application must not import infrastructure." },
            { group: ["@prisma/*", "socket.io"], message: "application must not import I/O libraries." },
          ],
        },
      ],
    },
  },
];