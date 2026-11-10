import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildApiReference } from '@/lib/api-reference';
import { createBlankForm } from '@/lib/form-engine';
import { operations } from '../packages/sdk/src/operations';
import { makeExample, parseApiOrigin } from '@/lib/api-examples';
import { createExampleForm } from '@/lib/api-example-form';
import * as contracts from '@/core/contracts';
import type { z } from 'zod';
import { sdkArchivePath } from '@/lib/sdk-distribution';

test('human API reference preserves auth, idempotency and schema fields from OpenAPI', () => {
  const raw: unknown = JSON.parse(readFileSync('public/openapi.json', 'utf8'));
  const reference = buildApiReference(raw, createBlankForm());
  const submit = reference.endpoints.find((e) => e.path.endsWith('/forms/{formId}/submissions') && e.method === 'POST');
  assert.ok(submit); assert.equal(submit.access, 'submissions:write'); assert.equal(submit.idempotency, true);
  assert.equal(submit.request.find((f) => f.name === 'revision')?.required, true);
  assert.equal(submit.request.find((f) => f.name === 'externalContext')?.required, false);
  const keys = reference.endpoints.find((e) => e.path.endsWith('/keys') && e.method === 'POST');
  assert.equal(keys?.access, 'owner session only'); assert.equal(keys?.public, false);
  const publicRead = reference.endpoints.find((e) => e.path === '/public/forms/{slug}' && e.method === 'GET');
  assert.equal(publicRead?.public, true);
});

test('reference origins match SDK transport policy and quote generated source safely', () => {
  assert.equal(parseApiOrigin('https://api.example/'), 'https://api.example');
  assert.equal(parseApiOrigin('http://localhost:3011'), 'http://localhost:3011');
  for (const value of ['http://remote.example', 'https://user:secret@api.example', 'https://api.example/path', 'https://api.example?key=value']) assert.throws(() => parseApiOrigin(value));
  const endpoint = buildApiReference(JSON.parse(readFileSync('public/openapi.json', 'utf8')), createExampleForm()).endpoints[0];
  const origin = "https://it's.example";
  assert.ok(makeExample(endpoint, 'TypeScript SDK', origin, 'session').includes(`baseUrl: ${JSON.stringify(origin)}`));
  assert.ok(makeExample(endpoint, 'TypeScript Fetch', origin, 'session').includes(`fetch(${JSON.stringify(`${origin}/api/v1/workspaces/personal`)}`));
});

test('public installation guides use the versioned SDK archive advertised by the UI', () => {
  for (const file of ['README.md', 'packages/sdk/README.md']) assert.ok(readFileSync(file, 'utf8').includes(sdkArchivePath));
});

test('rendered request bodies validate against shared contracts and sample answers match the form', () => {
  const form = createExampleForm();
  const reference = buildApiReference(JSON.parse(readFileSync('public/openapi.json', 'utf8')), form);
  const inputs: Record<string, z.ZodType> = {
    createForm: contracts.createFormSchema, saveDraft: contracts.updateFormSchema,
    archiveForm: contracts.versionSchema, publish: contracts.versionSchema, unpublish: contracts.versionSchema, restoreForm: contracts.versionSchema,
    submit: contracts.submissionInputSchema, submitPublic: contracts.submissionInputSchema, validateSubmission: contracts.submissionInputSchema,
    createKey: contracts.createKeySchema, importBackup: contracts.importBackupSchema,
    setRetention: contracts.retentionSettingsSchema, setIntegration: contracts.integrationSettingsSchema,
  };
  for (const endpoint of reference.endpoints) if (inputs[endpoint.operationId]) assert.ok(inputs[endpoint.operationId].safeParse(endpoint.example).success, endpoint.operationId);
  assert.equal(form.questions[0].id, 'q_name');
});

test('every documented operation has a stable SDK mapping and all three example languages', () => {
  const reference = buildApiReference(JSON.parse(readFileSync('public/openapi.json', 'utf8')), createBlankForm());
  assert.equal(reference.endpoints.length, Object.keys(operations).length);
  assert.equal(new Set(reference.endpoints.map((endpoint) => endpoint.operationId)).size, reference.endpoints.length);
  for (const endpoint of reference.endpoints) {
    const [method, path] = operations[endpoint.operationId];
    assert.equal(endpoint.method, method); assert.equal(endpoint.path, path);
    const sdk = makeExample(endpoint, 'TypeScript SDK', 'https://plyli.example', 'session');
    assert.ok(sdk.includes(`plyli.${endpoint.operationId}(`));
    assert.equal(sdk.includes('apiKey,'), !endpoint.public && !endpoint.access.includes('session'));
    assert.ok(makeExample(endpoint, 'TypeScript Fetch', 'https://plyli.example', 'session').includes('type Result ='));
    assert.ok(makeExample(endpoint, 'cURL', 'https://plyli.example', 'session').startsWith(`curl -X ${endpoint.method}`));
  }
});
