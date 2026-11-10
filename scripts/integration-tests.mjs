import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^mysql:$/.test(new URL(url).protocol) || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated MySQL database ending in _test.');
}
const env = { ...process.env, DATABASE_URL: url };
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['--import', 'tsx', '--test', 'tests/database.test.ts'],
  ['--import', 'tsx', '--test', 'tests/reliability.test.ts'],
  ['--import', 'tsx', '--test', 'tests/sdk-api.test.ts'],
  ['--conditions=react-server', '--import', 'tsx', '--test', 'tests/auth.test.ts'],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
