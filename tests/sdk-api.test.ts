import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { handleApiRequest } from '@/server/http';
import { createBlankForm } from '@/lib/form-engine';
import { formDefinitionSchema } from '@/core/contracts';
import { PlyliClient, PlyliError, operations } from '../packages/sdk/dist/client.js';

test('all SDK operations use the real API contracts, permissions, pagination and recovery', async () => {
  assert.ok(new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test'));
  const database = new PrismaClient();
  const userId = randomUUID();
  let workspaceId = '';
  const origin = 'http://localhost:3011';
  const coverage = new Set<string>();
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname.slice('/api/v1'.length);
    for (const [name, [method, template]] of Object.entries(operations)) {
      const pattern = new RegExp(`^${template.replace(/\{\w+\}/g, '[^/]+')}$`);
      if (method === request.method && pattern.test(path)) coverage.add(name);
    }
    return handleApiRequest(request, path.slice(1).split('/'), {
      database, origin, sessionUserId: async (headers) => headers.get('cookie') === 'fixture=session' ? userId : null,
    });
  };
  const session = new PlyliClient({ baseUrl: origin, session: { cookie: 'fixture=session' }, fetch: transport });
  const publicClient = new PlyliClient({ baseUrl: origin, fetch: transport });
  try {
    await database.user.create({ data: { id: userId, name: 'SDK contract fixture', email: `${userId}@example.invalid` } });
    workspaceId = (await session.provisionWorkspace()).id;
    const definition = formDefinitionSchema.parse(createBlankForm());
    definition.questions = [{ ...definition.questions[0], id: 'q_name', required: true }];
    definition.questionOrder = ['q_name'];
    let document = await session.createForm(workspaceId, definition);
    const formId = document.definition.id;
    const credential = await session.createKey(workspaceId, { name: 'SDK fixture', scopes: ['forms:read', 'forms:write', 'forms:publish', 'submissions:read', 'submissions:write', 'submissions:delete', 'analytics:read'], formIds: null });
    const sdk = new PlyliClient({ baseUrl: origin, apiKey: credential.secret, fetch: transport });
    assert.equal((await session.listKeys(workspaceId)).data.length, 1);
    assert.equal((await sdk.getForm(workspaceId, formId)).version, document.version);
    document = await sdk.saveDraft(workspaceId, formId, document.version, { ...document.definition, title: 'SDK registration' });
    document = await sdk.publish(workspaceId, formId, document.version);
    const published = await sdk.getPublishedForm(workspaceId, formId);
    assert.equal((await publicClient.getPublicForm(document.publicSlug)).revision, published.revision);
    const payload = { revision: published.revision, answers: { q_name: 'Avery' } };
    assert.equal((await sdk.validateSubmission(workspaceId, formId, payload)).valid, true);
    const attempt = randomUUID();
    const receipt = await sdk.submit(workspaceId, formId, payload, attempt);
    assert.equal((await sdk.submit(workspaceId, formId, payload, attempt)).replayed, true);
    await publicClient.submitPublic(document.publicSlug, payload, randomUUID());
    const first = await sdk.listSubmissions(workspaceId, formId, { limit: 1 });
    assert.ok(first.nextCursor);
    assert.equal((await sdk.listSubmissions(workspaceId, formId, { cursor: first.nextCursor })).data.length, 1);
    assert.equal((await sdk.listAnalyticsEvents(workspaceId, formId)).data.length, 0);
    const revisions = await sdk.listRevisions(workspaceId, formId, { limit: 1 });
    assert.ok(revisions.nextCursor);
    assert.equal((await sdk.listRevisions(workspaceId, formId, { cursor: revisions.nextCursor })).data.length, 1);
    await sdk.deleteResponse(workspaceId, formId, receipt.id);
    assert.equal((await sdk.listDeletedResponses(workspaceId, formId)).data.length, 1);
    await sdk.restoreResponse(workspaceId, formId, receipt.id);
    assert.equal((await sdk.deleteAllResponses(workspaceId, formId)).deleted, 2);
    const integration = await sdk.getIntegration(workspaceId, formId);
    const settings = await session.setIntegration(workspaceId, formId, { expectedVersion: integration.version, policy: { mode: 'private', allowPublicContext: false, contextFields: [] } });
    assert.equal(settings.policy.mode, 'private');
    document = await sdk.unpublish(workspaceId, formId, settings.version);
    await sdk.archiveForm(workspaceId, formId, document.version);
    const archived = await sdk.listForms(workspaceId, { archived: true });
    assert.equal(archived.data.length, 1);
    document = await sdk.restoreForm(workspaceId, formId, archived.data[0].version);
    assert.equal(document.publishedRevision, null);
    await session.setRetention(workspaceId, { responseRetentionDays: 90, trashRetentionDays: 7 });
    assert.equal((await session.getRetention(workspaceId)).responseRetentionDays, 90);
    const imported = formDefinitionSchema.parse(createBlankForm());
    assert.equal((await session.importBackup(workspaceId, { schemaVersion: 2, app: 'plyli', exportedAt: new Date().toISOString(), forms: [imported], responses: [] })).forms, 1);
    const pages = [];
    for await (const item of sdk.iterateForms(workspaceId, { limit: 1 })) pages.push(item);
    assert.equal(pages.length, 2);
    await assert.rejects(sdk.createKey(workspaceId, { name: 'Denied', scopes: ['forms:read'] }), /session/);
    await session.revokeKey(workspaceId, credential.id);
    await assert.rejects(sdk.getForm(workspaceId, formId), (error: unknown) => error instanceof PlyliError && error.status === 401);
    assert.deepEqual([...coverage].sort(), Object.keys(operations).sort());
  } finally {
    if (workspaceId) {
      const where = { workspaceId };
      await database.analyticsEvent.deleteMany({ where }); await database.submission.deleteMany({ where });
      await database.formRevision.deleteMany({ where }); await database.form.deleteMany({ where });
      await database.apiCredential.deleteMany({ where }); await database.auditEvent.deleteMany({ where });
      await database.membership.deleteMany({ where }); await database.workspace.deleteMany({ where: { id: workspaceId } });
    }
    await database.user.deleteMany({ where: { id: userId } });
    await database.$disconnect();
  }
});
