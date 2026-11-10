import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBlankForm } from '../lib/form-engine';
import { sdkArchivePath, sdkVersion } from '../lib/sdk-distribution';
import { referenceExamples } from './test-api-examples';

async function main() {
  const cli = process.env.npm_execpath;
  if (!cli || !/pnpm/i.test(cli)) throw new Error('Run this check with pnpm test:consumer.');
  const pnpmCli = cli;
  const directory = await mkdtemp(join(tmpdir(), 'plyli-sdk-consumer-'));
  function run(args: string[]) {
    const result = spawnSync(process.execPath, [pnpmCli, ...args], { cwd: directory, stdio: 'inherit', windowsHide: true, env: process.env });
    if (result.status !== 0) throw new Error(`Consumer command failed: pnpm ${args[0]}. Retained consumer: ${directory}`);
  }
  const urlIndex = process.argv.indexOf('--url');
  const archiveUrl = urlIndex < 0 ? undefined : process.argv[urlIndex + 1];
  const archive = join(directory, `plyli-sdk-${sdkVersion}.tgz`);
  if (archiveUrl) {
    const response = await fetch(archiveUrl);
    if (!response.ok) throw new Error('SDK download failed.');
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  } else await writeFile(archive, await readFile(resolve(`public${sdkArchivePath}`)));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'plyli-sdk-consumer-check', private: true, type: 'module', packageManager: 'pnpm@10.25.0' }));
  await writeFile(join(directory, 'pnpm-workspace.yaml'), 'onlyBuiltDependencies:\n  - esbuild\n');
  // Exercise the same URL installation shown in the reference when supplied.
  run(['add', archiveUrl ?? archive]);
  const installed: { version: string } = JSON.parse(await readFile(join(directory, 'node_modules/@plyli/sdk/package.json'), 'utf8'));
  if (installed.version !== sdkVersion) throw new Error('Installed SDK version does not match the advertised archive.');
  run(['add', '-D', 'typescript@5.9.3', '@types/node@22.20.5', 'esbuild@0.28.2']);
  const form = createBlankForm();
  form.questions[0].logicRules = [{ id: 'skip_rule', operator: 'equals', value: 'Skip', targetId: 'completion' }];
  const source = `import { PlyliClient, type FormSchema } from '@plyli/sdk';
import { validateSubmission, resolveNextNodeId } from '@plyli/sdk/engine';
const form: FormSchema = ${JSON.stringify(form)};
const client = new PlyliClient({baseUrl: 'https://plyli.example'});
const first = form.questions[0].id;
if (typeof client.getPublishedForm !== 'function') throw new Error('Client export missing');
if (validateSubmission(form, {}).valid) throw new Error('Required validation bypassed');
if (!validateSubmission(form, {[first]:'Skip'}).valid) throw new Error('Branch skip invalid');
if (validateSubmission(form, {[first]:'Continue'}).valid) throw new Error('Reachable required question bypassed');
if (resolveNextNodeId(form, first, {[first]:'Skip'}) !== 'completion') throw new Error('Branch mismatch');
console.log('External SDK client, declarations, validation and branching passed');
`;
  await writeFile(join(directory, 'index.ts'), source);
  for (const example of referenceExamples()) await writeFile(join(directory, example.name), example.code);
  await writeFile(join(directory, 'engine.ts'), `export { validateSubmission, resolveNextNodeId } from '@plyli/sdk/engine';`);
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], skipLibCheck: false, outDir: 'dist' }, include: ['*.ts'] }));
  run(['exec', 'tsc']);
  const executed = spawnSync(process.execPath, ['dist/index.js'], { cwd: directory, stdio: 'inherit', windowsHide: true });
  if (executed.status !== 0) throw new Error('External engine checks failed.');
  run(['exec', 'esbuild', 'index.ts', '--bundle', '--platform=node', '--format=esm', '--minify', '--outfile=bundle.mjs', '--metafile=server-meta.json']);
  run(['exec', 'esbuild', 'engine.ts', '--bundle', '--platform=browser', '--format=esm', '--minify', '--outfile=browser-engine.js', '--metafile=browser-meta.json']);
  const bundled = spawnSync(process.execPath, ['bundle.mjs'], { cwd: directory, stdio: 'inherit', windowsHide: true });
  if (bundled.status !== 0) throw new Error('Production bundle failed.');
  for (const file of ['server-meta.json', 'browser-meta.json']) {
    const meta: { inputs: Record<string, unknown> } = JSON.parse(await readFile(join(directory, file), 'utf8'));
    if (Object.keys(meta.inputs).some((input) => !input.includes('node_modules/') && !['index.ts', 'engine.ts'].includes(input))) throw new Error('Bundle imported files outside the consumer dependency.');
    if (Object.keys(meta.inputs).some((input) => /prisma|next\/|react\/|server\//.test(input))) throw new Error('Unexpected application runtime dependency.');
  }
  const browser = await readFile(join(directory, 'browser-engine.js'), 'utf8');
  if (/PLYLI_API_KEY|GOOGLE_CLIENT_SECRET|BETTER_AUTH_SECRET|C:[/\\]Projects/i.test(browser)) throw new Error('Unexpected private configuration in the browser bundle.');
  await mkdir('.local-notes', { recursive: true });
  await writeFile('.local-notes/sdk-consumer-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), installation: archiveUrl ? 'http-archive-and-download' : 'downloaded-archive', typeResolution: true, validationAndBranching: true, serverProductionBundle: true, browserEngineBundle: true, applicationSourceImports: false, privateEnvironmentBundled: false }, null, 2));
  // Remove only this test's newly created temporary consumer.
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('plyli-sdk-consumer-')) throw new Error('Unsafe consumer cleanup path.');
  await rm(directory, { recursive: true });
  console.log('Isolated SDK consumer checks passed.');
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'SDK consumer test failed.'); process.exitCode = 1; });
