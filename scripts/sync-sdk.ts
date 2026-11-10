import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
// Generated from the actual headless engine, never manually forked contracts.
const destination = resolve('packages/sdk/src/generated');
mkdirSync(destination, { recursive: true });
for (const file of readdirSync('core').filter((f) => f.endsWith('.ts'))) {
  const code = readFileSync(join('core', file), 'utf8').replace(/\r\n/g, '\n').replace(/(from\s+['"]\.\.?\/[^'"]+)(['"])/g, '$1.js$2').trimEnd();
  writeFileSync(join(destination, file), `// Generated from Plyli core/${file}; run pnpm sdk:sync in Plyli.\n${code}\n`);
}
writeFileSync(resolve('packages/sdk/src/engine.ts'), readdirSync('core').filter((f) => f.endsWith('.ts')).map((f) => `export * from './generated/${f.replace(/\.ts$/, '.js')}';`).join('\n') + '\n');
console.log('Synchronized the shared Plyli engine and contracts.');
