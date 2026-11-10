import test from 'node:test';
import assert from 'node:assert/strict';
import { PlyliClient, PlyliError, operations } from '../dist/client.js';
import { createDefaultQuestion, validateQuestionAnswer, formDefinitionSchema } from '../dist/engine.js';

test('standalone engine validates questions without React, browser storage or hosted API', () => {
  const question = createDefaultQuestion('email'); question.required = true;
  assert.equal(validateQuestionAnswer(question, 'invalid').valid, false);
  assert.equal(validateQuestionAnswer(question, 'developer@example.com').valid, true);
  assert.equal(typeof formDefinitionSchema.parse, 'function');
});

test('every documented operation is a public SDK method', () => {
  for (const name of Object.keys(operations)) assert.equal(typeof PlyliClient.prototype[name], 'function');
});

test('configuration, pagination and session boundaries fail before transport', async () => {
  assert.throws(() => new PlyliClient({ baseUrl: 'https://forms.example', timeoutMs: -1 }));
  assert.throws(() => new PlyliClient({ baseUrl: 'https://forms.example', apiKey: 'key', session: {} }));
  assert.throws(() => new PlyliClient({ baseUrl: 'https://forms.example', session: {} }), /Cookie/);
  const client = new PlyliClient({ baseUrl: 'https://forms.example', apiKey: 'key', fetch: () => { throw new Error('Must not send'); } });
  await assert.rejects(client.createKey('ws_1', { name: 'test', scopes: ['forms:read'] }), /session/);
  assert.throws(() => client.listForms('ws_1', { limit: 0 }));
  assert.throws(() => client.listRevisions('ws_1', 'form_1', { cursor: 'invalid' }));
});

test('session writes supply origin and public reads omit cookies', async () => {
  const requests = [];
  const client = new PlyliClient({ baseUrl: 'https://forms.example', session: { cookie: 'fixture=session' }, fetch: async (_url, init) => {
    requests.push(init);
    return Response.json({ data: { id: 'workspace_1', name: 'Workspace', role: 'OWNER' } });
  } });
  await client.provisionWorkspace();
  assert.equal(requests[0].headers.Cookie, 'fixture=session');
  assert.equal(requests[0].headers.Origin, 'https://forms.example');
  await assert.rejects(client.getPublicForm('slug_1'));
  assert.equal(requests[1].headers.Cookie, undefined);
  assert.equal(requests[1].credentials, 'omit');
});

test('network, malformed JSON, invalid responses and rate limits have consistent errors', async () => {
  for (const [fetch, code] of [
    [async () => { throw new Error('offline'); }, 'NETWORK_ERROR'],
    [async () => { throw new DOMException('expired', 'TimeoutError'); }, 'TIMEOUT'],
    [async () => new Response('<html>unavailable</html>'), 'INVALID_RESPONSE'],
    [async () => Response.json({ data: {} }), 'INVALID_RESPONSE'],
  ]) {
    const client = new PlyliClient({ baseUrl: 'https://forms.example', fetch });
    await assert.rejects(client.getPublicForm('slug_1'), (error) => error instanceof PlyliError && error.code === code);
  }
  const limited = new PlyliClient({ baseUrl: 'https://forms.example', fetch: async () => Response.json({ error: { code: 'RATE_LIMITED', message: 'Wait', requestId: 'req_1' } }, { status: 429, headers: { 'Retry-After': '60' } }) });
  await assert.rejects(limited.getPublicForm('slug_1'), (error) => error instanceof PlyliError && error.retryAfter === '60');
});
test('SDK retains HTTP error details and correlation IDs', async () => {
  const client = new PlyliClient({ baseUrl: 'https://forms.example', apiKey: 'test', fetch: async () => Response.json({ error: { code: 'FORBIDDEN', message: 'Scope rejected.', requestId: 'request_1' } }, { status: 403 }) });
  await assert.rejects(client.getForm('workspace_1', 'form_1'), (e) => e instanceof PlyliError && e.status === 403 && e.requestId === 'request_1');
});
test('public client sends no bearer credential and validates response shapes', async () => {
  let auth;
  const client = new PlyliClient({ baseUrl: 'https://forms.example/api/v1', apiKey: 'private_key', fetch: async (_url, init) => { auth = init.headers.Authorization; return Response.json({ data: { invalid: true } }); } });
  await assert.rejects(client.getPublicForm('public_slug'));
  assert.equal(auth, undefined);
});
test('browser clients cannot hold API keys and remote endpoints require HTTPS', () => {
  assert.throws(() => new PlyliClient({ baseUrl: 'http://forms.example', apiKey: 'private' }), /HTTPS/);
  globalThis.window = {};
  try { assert.throws(() => new PlyliClient({ baseUrl: 'https://forms.example', apiKey: 'private' }), /backend/); }
  finally { delete globalThis.window; }
});
