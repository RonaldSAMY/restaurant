// One lint config for the whole monorepo, run on the host and in CI.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

/** Constructs that must carry a described TSDoc comment (exported or not). */
const documented = [
  'ClassDeclaration',
  'MethodDefinition',
  'TSAbstractMethodDefinition',
  'PropertyDefinition',
  'TSAbstractPropertyDefinition',
  'TSInterfaceBody > TSPropertySignature',
  'TSTypeAliasDeclaration > TSTypeLiteral > TSPropertySignature',
  'FunctionDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'Program > VariableDeclaration',
  'Program > ExportNamedDeclaration[declaration.type="VariableDeclaration"]',
];

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/.next/',
    '**/next-env.d.ts',
    'apps/api/src/generated/',
    '_bmad*/',
    '.claude/',
    'pnpm-lock.yaml',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        { publicOnly: false, require: {}, contexts: documented },
      ],
      'jsdoc/require-description': ['error', { contexts: ['any'] }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [nextPlugin.configs['core-web-vitals']],
    settings: { next: { rootDir: 'apps/web' } },
  },
  prettier,
);
