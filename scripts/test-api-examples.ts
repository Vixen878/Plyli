import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApiReference } from '../lib/api-reference';
import { makeExample, engineExample, errorExample } from '../lib/api-examples';
import { createExampleForm } from '../lib/api-example-form';

export function referenceExamples() {
  const data = buildApiReference(JSON.parse(readFileSync('public/openapi.json', 'utf8')), createExampleForm());
  return [
    ...data.endpoints.flatMap((endpoint) => (['TypeScript SDK', 'TypeScript Fetch'] as const).map((language) => ({
      name: `${endpoint.operationId}-${language.replaceAll(' ', '-')}.ts`,
      code: makeExample(endpoint, language, 'https://plyli.example', '__Secure-better-auth.session_token'),
    }))),
    { name: 'headless-engine.ts', code: engineExample },
    { name: 'errors.ts', code: errorExample },
    ...Array.from(readFileSync('docs/API.md', 'utf8').matchAll(/```ts\r?\n([\s\S]*?)```/g), (match, index) => ({ name: `api-guide-${index + 1}.ts`, code: match[1] })),
  ];
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/test-api-examples.ts')) {
  const directory = resolve('.tmp/reference-examples');
  mkdirSync(directory, { recursive: true });
  const examples = referenceExamples();
  const files = examples.map(({ name, code }) => { const path = resolve(directory, name); writeFileSync(path, code); return path; });
  const program = ts.createProgram(files, {
    strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: false,
    paths: { '@plyli/sdk': [resolve('packages/sdk/dist/client.d.ts')], '@plyli/sdk/engine': [resolve('packages/sdk/dist/engine.d.ts')] },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
    process.exitCode = 1;
  } else console.log(`Compiled ${examples.length} strict TypeScript examples against SDK public declarations.`);
}
