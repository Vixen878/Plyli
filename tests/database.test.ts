import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { FormService } from '@/server/forms';
import { authenticateApiKey, consumeRateLimit, type Principal } from '@/server/security';
import { handleApiRequest } from '@/server/http';
import { createBlankForm } from '@/lib/form-engine';
import { createRevisionSnapshot } from '@/core/submissions';
import { processFormSubmission } from '@/core/submissions';
import { formDocumentSchema, responseRecordSchema } from '@/core/contracts';
import { z } from 'zod';

test('MySQL persistence, tenant boundaries and immutable history', async (t) => {
  assert.ok(new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test'));
  const db = new PrismaClient(); const service = new FormService(db);
  const userIds = Array.from({ length: 4 }, () => randomUUID());
  const spaces: string[] = [];
  const owner: Principal = { kind: 'session', userId: userIds[0] };
  const other: Principal = { kind: 'session', userId: userIds[1] };
  try {
    for (const id of userIds) await db.user.create({ data: { id, name: 'Integration test', email: `${id}@example.invalid` } });
    for (const id of userIds.slice(0, 2)) spaces.push((await service.provisionWorkspace(id)).id);
    const workspaceId = spaces[0]; const otherWorkspaceId = spaces[1];
    const definition = createBlankForm(); definition.id = randomUUID(); definition.questions[0].required = true;
    definition.questions = [definition.questions[0]]; definition.questionOrder = [definition.questions[0].id];
    let doc = await service.create(owner, workspaceId, { definition });

    await t.test('saves/retrieves full definitions and provisions personal workspace once', async () => {
      assert.equal((await service.provisionWorkspace(userIds[0])).id, workspaceId);
      assert.deepEqual(formDocumentSchema.parse(await service.get(owner, workspaceId, definition.id)), doc);
      assert.equal(doc.definition.appearance?.templateId, definition.appearance?.templateId);
      const connection = new PrismaClient();
      try { assert.equal((await new FormService(connection).get(owner, workspaceId, definition.id)).version, 1); } finally { await connection.$disconnect(); }
    });

    await t.test('persists titles at the API limit without truncation', async () => {
      const title = 'T'.repeat(255);
      const created = await service.create(owner, workspaceId, { definition: { ...definition, id: randomUUID(), title } });
      assert.equal(created.definition.title, title);
      const updated = await service.update(owner, workspaceId, created.definition.id, {
        expectedVersion: created.version, definition: { ...created.definition, title: 'U'.repeat(255) },
      });
      assert.equal(updated.definition.title.length, 255);
      await assert.rejects(service.update(owner, workspaceId, created.definition.id, {
        expectedVersion: updated.version, definition: { ...updated.definition, title: 'X'.repeat(256) },
      }));
      await service.archive(owner, workspaceId, created.definition.id, updated.version);
    });

    await t.test('concurrent initial visits provision exactly one owned workspace', async () => {
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.provisionWorkspace(userIds[2])));
      const created = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.id] : []);
      spaces.push(...new Set(created));
      assert.deepEqual(results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []), []);
      assert.equal(new Set(created).size, 1);
      assert.equal(await db.membership.count({ where: { workspaceId: created[0], userId: userIds[2], role: 'OWNER' } }), 1);
    });

    await t.test('independent connections provision the same workspace without overwriting it on later visits', async () => {
      const userId = userIds[3];
      const secondConnection = new PrismaClient();
      try {
        const services = [service, new FormService(secondConnection)];
        await secondConnection.$connect();
        const visits = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => services[index % 2].provisionWorkspace(userId)));
        const rows = await db.workspace.findMany({
          where: { personalOwnerId: userId },
          include: { memberships: { select: { userId: true, role: true } } },
        });
        spaces.push(...rows.map((row) => row.id));
        assert.deepEqual(visits.flatMap((visit) => visit.status === 'rejected' ? [visit.reason] : []), []);
        assert.equal(rows.length, 1);
        const [workspace] = rows;
        assert.deepEqual(workspace.memberships, [{ userId, role: 'OWNER' }]);
        const expected = { id: workspace.id, name: 'My workspace', role: 'OWNER' };
        for (const visit of visits) assert.deepEqual(visit, { status: 'fulfilled', value: expected });

        const name = 'Renamed workspace';
        await db.workspace.update({ where: { id: workspace.id }, data: { name } });
        assert.deepEqual(await services[1].provisionWorkspace(userId), { ...expected, name });
        assert.equal(await db.membership.count({ where: { workspaceId: workspace.id, userId, role: 'OWNER' } }), 1);
      } finally {
        await secondConnection.$disconnect();
      }
    });

    await t.test('cross-workspace and viewer writes cannot access/change forms', async () => {
      await assert.rejects(service.get(other, workspaceId, definition.id), { status: 404 });
      await assert.rejects(service.get(other, otherWorkspaceId, definition.id), { status: 404 });
      await db.membership.create({ data: { workspaceId, userId: userIds[2], role: 'VIEWER' } });
      const viewer: Principal = { kind: 'session', userId: userIds[2] };
      assert.equal((await service.get(viewer, workspaceId, definition.id)).version, 1);
      await assert.rejects(service.update(viewer, workspaceId, definition.id, { expectedVersion: 1, definition }), { status: 403 });
    });

    await t.test('concurrent edits yield one winner and preserve original revision', async () => {
      const results = await Promise.allSettled(['First', 'Second'].map((title) => service.update(owner, workspaceId, definition.id, { expectedVersion: 1, definition: { ...definition, title } })));
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      doc = await service.get(owner, workspaceId, definition.id);
      assert.equal(doc.version, 2); assert.equal(doc.definition.revision, 2);
      const rows = await service.revisions(owner, workspaceId, definition.id, 10);
      assert.equal(rows.data[0].definition?.title, definition.title);
      await assert.rejects(service.update(owner, workspaceId, definition.id, { expectedVersion: 1, definition }), { status: 409 });
    });

    await t.test('published revision remains pinned during later draft edits', async () => {
      doc = await service.publish(owner, workspaceId, definition.id, doc.version);
      const published = doc.definition;
      doc = await service.update(owner, workspaceId, definition.id, { expectedVersion: doc.version, definition: { ...published, title: 'Unpublished change', questions: published.questions.map((q) => ({ ...q, title: 'Changed question' })) } });
      assert.equal((await service.getPublished(doc.publicSlug)).definition.title, published.title);
      assert.equal(doc.publishedRevision, published.revision);
    });

    await t.test('server validates required answers and idempotently persists exact revision', async () => {
      const revision = doc.publishedRevision;
      assert.ok(revision);
      await assert.rejects(service.submit(doc.publicSlug, { revision, answers: {} }, randomUUID()), { code: 'INVALID_ANSWERS' });
      await assert.rejects(service.submit(doc.publicSlug, { revision: revision + 1, answers: {} }, randomUUID()), { code: 'REVISION_CHANGED' });
      const key = randomUUID(); const payload = { revision, answers: { [definition.questions[0].id]: 'Ada', extra: 'ignored' } };
      const receipts = await Promise.all([service.submit(doc.publicSlug, payload, key), service.submit(doc.publicSlug, payload, key)]);
      assert.equal(receipts[0].id, receipts[1].id);
      assert.equal(receipts.filter((r) => r.replayed).length, 1);
      await assert.rejects(service.submit(doc.publicSlug, { ...payload, answers: { [definition.questions[0].id]: 'Changed' } }, key), { code: 'IDEMPOTENCY_CONFLICT' });
      const rows = await service.submissions(owner, workspaceId, definition.id, 10);
      assert.equal(rows.data.length, 1); assert.equal(rows.data[0].formRevision, revision); assert.equal(rows.data[0].answers.extra, undefined);
      await assert.rejects(service.submissions(other, workspaceId, definition.id, 10), { status: 404 });
      await assert.rejects(db.formRevision.delete({ where: { workspaceId_formId_revision: { workspaceId, formId: definition.id, revision } } }));
    });

    await t.test('API key hashes, scopes, expiration, revocation and owner-only key creation', async () => {
      const key = await service.createKey(owner, workspaceId, { name: 'Read-only', scopes: ['forms:read'] });
      const row = await db.apiCredential.findUniqueOrThrow({ where: { id: key.id } }); assert.notEqual(row.keyHash, key.secret);
      const principal = await authenticateApiKey(db, `Bearer ${key.secret}`);
      await service.get(principal, workspaceId, definition.id);
      await assert.rejects(service.update(principal, workspaceId, definition.id, { expectedVersion: doc.version, definition: doc.definition }), { status: 403 });
      await assert.rejects(service.get(principal, otherWorkspaceId, definition.id), { status: 404 });
      await assert.rejects(service.createKey(principal, workspaceId, { name: 'No escalation', scopes: ['forms:write'] }), { status: 403 });
      await db.apiCredential.update({ where: { id: key.id }, data: { expiresAt: new Date(0) } });
      await assert.rejects(authenticateApiKey(db, `Bearer ${key.secret}`), { status: 401 });
      await db.apiCredential.update({ where: { id: key.id }, data: { expiresAt: null } });
      await service.revokeKey(owner, workspaceId, key.id);
      await assert.rejects(authenticateApiKey(db, `Bearer ${key.secret}`), { status: 401 });
      await assert.rejects(authenticateApiKey(db, 'Bearer invalid'), { status: 401 });
      const writeOnly = await service.createKey(owner, workspaceId, { name: 'Write-only', scopes: ['forms:write'] });
      const writer = await authenticateApiKey(db, `Bearer ${writeOnly.secret}`);
      const fresh = createBlankForm(); fresh.id = randomUUID();
      const created = await service.create(writer, workspaceId, { definition: fresh });
      assert.equal(created.definition.id, fresh.id);
      await assert.rejects(service.get(writer, workspaceId, fresh.id), { status: 403 });
    });

    await t.test('bounded cursor lists and HTTP authentication/CSRF/contracts', async () => {
      const dependencies = { database: db, origin: 'http://localhost:3000', sessionUserId: async () => null as string | null };
      const path = ['workspaces', workspaceId, 'forms'];
      const unauth = await handleApiRequest(new Request('http://localhost/api/v1/workspaces/x/forms'), path, dependencies); assert.equal(unauth.status, 401);
      const authDeps = { ...dependencies, sessionUserId: async () => userIds[0] };
      const csrf = await handleApiRequest(new Request('http://localhost/api', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }), path, authDeps); assert.equal(csrf.status, 403);
      const invalid = await handleApiRequest(new Request('http://localhost/api?limit=10000'), path, authDeps); assert.equal(invalid.status, 422);
      const result = await handleApiRequest(new Request('http://localhost/api?limit=1'), path, authDeps); assert.equal(result.status, 200);
      const firstPage = z.object({ data: z.array(formDocumentSchema).length(1), nextCursor: z.string().nullable() }).parse(await result.json());
      assert.ok(firstPage.nextCursor);
      const second = await service.list(owner, workspaceId, 1, firstPage.nextCursor);
      assert.notEqual(second.data[0].definition.id, firstPage.data[0].definition.id);
      const stranger = await handleApiRequest(new Request('http://localhost/api'), path, { ...dependencies, sessionUserId: async () => userIds[1] }); assert.equal(stranger.status, 404);
    });

    await t.test('shared DB rate limits reject excess operations', async () => {
      const identity = randomUUID(); await consumeRateLimit(db, identity, 2); await consumeRateLimit(db, identity, 2);
      await assert.rejects(consumeRateLimit(db, identity, 2), { status: 429 });
    });

    await t.test('concurrent first requests create one rate bucket and enforce its exact quota', async (rateTest) => {
      const now = Date.now(); rateTest.mock.method(Date, 'now', () => now);
      const identity = randomUUID();
      const results = await Promise.allSettled(Array.from({ length: 20 }, () => consumeRateLimit(db, identity, 5)));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 5);
      for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'RATE_LIMITED');
    });

    await t.test('backup import preserves historical snapshots and atomically rejects conflicts', async () => {
      const legacy = createBlankForm(); legacy.id = randomUUID();
      legacy.questions = [legacy.questions[0]]; legacy.questionOrder = [legacy.questions[0].id];
      const snapshot = createRevisionSnapshot(legacy);
      const processed = processFormSubmission(legacy, { [legacy.questions[0].id]: 'Historical answer' }); assert.ok(processed.record);
      const oldRecord = responseRecordSchema.parse({ ...processed.record, id: randomUUID() });
      const changed = { ...legacy, revision: 2, questions: [], questionOrder: [] };
      const event = { id: randomUUID(), schemaVersion: 1, formId: legacy.id, formRevision: 1, sessionId: randomUUID(), type: 'form_view', timestamp: new Date().toISOString(), sessionSource: 'local_preview' };
      const backup = { app: 'fieldnote-studio', schemaVersion: 2, exportedAt: new Date().toISOString(), forms: [changed], revisions: [snapshot], responses: [oldRecord], analyticsEvents: [event], fullRevisions: [legacy] };
      await service.importBackup(owner, workspaceId, backup);
      const history = await service.revisions(owner, workspaceId, legacy.id, 10);
      assert.deepEqual(history.data[0].definition, legacy); assert.deepEqual(history.data[0].legacySnapshot, snapshot);
      assert.equal((await service.analyticsEvents(owner, workspaceId, legacy.id, 10)).data[0].id, event.id);
      assert.equal((await service.submissions(owner, workspaceId, legacy.id, 10)).data[0].answers[legacy.questions[0].id], 'Historical answer');
      const extra = createBlankForm(); extra.id = randomUUID();
      await assert.rejects(service.importBackup(owner, workspaceId, { ...backup, forms: [extra, changed] }));
      assert.equal(await db.form.findUnique({ where: { id: extra.id } }), null);
      await assert.rejects(service.importBackup(owner, workspaceId, { ...backup, revisions: [], fullRevisions: [] }), { code: 'INVALID_BACKUP' });
      await assert.rejects(service.importBackup(owner, workspaceId, { ...backup, forms: [changed, changed] }), { code: 'INVALID_BACKUP' });
    });

    await t.test('archive disables public access and retains exact response history', async () => {
      await service.archive(owner, workspaceId, definition.id, doc.version);
      await assert.rejects(service.getPublished(doc.publicSlug), { status: 404 });
      assert.equal((await service.submissions(owner, workspaceId, definition.id, 10)).data.length, 1);
      assert.ok(await db.formRevision.count({ where: { workspaceId, formId: definition.id } }) >= 3);
      assert.ok(await db.auditEvent.count({ where: { workspaceId } }) >= 3);
    });
  } finally {
    // Delete only fixtures owned by this run, in restrictive-FK order.
    const where = { workspaceId: { in: spaces } };
    await db.analyticsEvent.deleteMany({ where }); await db.submission.deleteMany({ where });
    await db.formRevision.deleteMany({ where }); await db.form.deleteMany({ where });
    await db.apiCredential.deleteMany({ where }); await db.auditEvent.deleteMany({ where });
    await db.membership.deleteMany({ where }); await db.workspace.deleteMany({ where: { id: { in: spaces } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
