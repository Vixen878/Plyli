import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: fileURLToPath(new URL('.', import.meta.url)),
  // Resolve Next's own plugins from its dependency context under pnpm.
  resolvePluginsRelativeTo: dirname(require.resolve('eslint-config-next/package.json')),
});
const config = [
  { ignores: ['**/node_modules/**', 'packages/sdk/dist/**', 'packages/sdk/src/generated/**', '.local-notes/**', '.tmp/**', '.next/**', 'graphify-out/**', 'coverage/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
export default config;
