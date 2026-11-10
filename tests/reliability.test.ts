import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createBlankForm } from '@/lib/form-engine';
import { FormService } from '@/server/forms';
import { ManagementService, enforceRetention } from '@/server/management';
import { authenticateApiKey, type Principal } from '@/server/security';
import { handleApiRequest } from '@/server/http';
import { backupConfigFromEnvironment, createBackup, verifyBackup, restoreIntoNewTestDatabase, dropRestoreTestDatabase, mysqlQuery, pruneBackups } from '@/server/backups';
import { PlyliClient, PlyliError } from '../packages/sdk/dist/client.js';

test('private embedding, metadata allowlists, recovery, retention and encrypted restore', async (t) => {
  assert.ok(new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test'));
  const db = new PrismaClient(); const forms = new FormService(db); const management = new ManagementService(db);
  const userId = randomUUID(); const otherId = randomUUID(); const spaces: string[] = [];
  const owner: Principal = { kind: 'session', userId }; const stranger: Principal = { kind: 'session', userId: otherId };
  const backupDirectory = await mkdtemp(join(tmpdir(), 'plyli-backup-test-'));
  try {
    for (const id of [userId, otherId]) await db.user.create({ data: { id, name: 'Reliability fixture', email: `${id}@example.invalid` } });
    spaces.push((await forms.provisionWorkspace(userId)).id, (await forms.provisionWorkspace(otherId)).id);
    const workspaceId = spaces[0];
    const definition = createBlankForm(); definition.id = randomUUID(); definition.questions = [{ ...definition.questions[0], required: true }]; definition.questionOrder = definition.questions.map((q) => q.id);
    let doc = await forms.create(owner, workspaceId, { definition }); doc = await forms.publish(owner, workspaceId, definition.id, doc.version);
    const second = await forms.create(owner, workspaceId, { definition: { ...definition, id: randomUUID() } });
    const policy = await management.updateIntegration(owner, workspaceId, definition.id, { expectedVersion: doc.version, policy: { mode: 'private', contextFields: [{ key: 'eventId', type: 'string', required: true }, { key: 'seats', type: 'number', required: false }] } });
    doc = { ...doc, version: policy.version };
    const credential = await forms.createKey(owner, workspaceId, { name: 'Embedding fixture', scopes: ['forms:read', 'submissions:write', 'submissions:read', 'submissions:delete'], formIds: [definition.id] });
    const principal = await authenticateApiKey(db, `Bearer ${credential.secret}`);
    const transport: typeof fetch = async (input, init) => { const request = new Request(input, init); const segments = new URL(request.url).pathname.replace('/api/v1/', '').split('/'); return handleApiRequest(request, segments, { database: db, origin: 'http://localhost:3011', sessionUserId: async () => null }); };
    const sdk = new PlyliClient({ baseUrl: 'http://localhost:3011', apiKey: credential.secret, fetch: transport });
    const input = { revision: doc.definition.revision, answers: { [definition.questions[0].id]: 'Hosted application' }, externalContext: { eventId: 'event_123', seats: 2 } };
    let receiptId = '';
    await t.test('private definitions reject anonymous access and keys are bound to selected forms', async () => {
      await assert.rejects(forms.getPublished(doc.publicSlug), { status: 404 });
      await assert.rejects(forms.submit(doc.publicSlug, input, randomUUID()), { status: 404 });
      assert.equal((await sdk.getPublishedForm(workspaceId, definition.id)).id, definition.id);
      await assert.rejects(sdk.getForm(workspaceId, second.definition.id), (error: unknown) => error instanceof PlyliError && error.status === 404);
      assert.equal((await sdk.listForms(workspaceId)).data.length, 1);
      await assert.rejects(management.updateIntegration(principal, workspaceId, definition.id, { expectedVersion: doc.version, policy: { mode: 'public' } }), { status: 403 });
      await assert.rejects(forms.createKey(owner, workspaceId, { name: 'Invalid grant', scopes: ['forms:read'], formIds: ['not_yours'] }), { status: 422 });
      const keys = await management.keys(owner, workspaceId, 100);
      assert.equal(JSON.stringify(keys).includes(credential.secret), false); assert.equal(JSON.stringify(keys).includes('keyHash'), false);
    });
    await t.test('shared context validation rejects missing, unknown and wrongly typed fields', async () => {
      assert.equal((await sdk.validateSubmission(workspaceId, definition.id, input)).valid, true);
      assert.equal((await sdk.validateSubmission(workspaceId, definition.id, { ...input, externalContext: {} })).valid, false);
      await assert.rejects(sdk.submit(workspaceId, definition.id, { ...input, externalContext: { eventId: 'event', unauthorized: 'x' } }, randomUUID()), (error: unknown) => error instanceof PlyliError && error.code === 'INVALID_CONTEXT');
      await assert.rejects(sdk.submit(workspaceId, definition.id, { ...input, externalContext: { eventId: 23 } }, randomUUID()), (error: unknown) => error instanceof PlyliError && error.code === 'INVALID_CONTEXT');
      const key = randomUUID(); const result = await sdk.submit(workspaceId, definition.id, input, key); receiptId = result.id;
      assert.equal((await sdk.submit(workspaceId, definition.id, input, key)).replayed, true);
      assert.deepEqual((await sdk.listSubmissions(workspaceId, definition.id)).data[0].externalContext, input.externalContext);
      await sdk.deleteResponse(workspaceId, definition.id, receiptId);
      assert.equal((await sdk.listSubmissions(workspaceId, definition.id)).data.length, 0);
      await assert.rejects(sdk.submit(workspaceId, definition.id, input, key), (error: unknown) => error instanceof PlyliError && error.status === 410);
      await sdk.restoreResponse(workspaceId, definition.id, receiptId);
      assert.equal((await sdk.listSubmissions(workspaceId, definition.id)).data.length, 1);
      await assert.rejects(management.trashResponses(stranger, workspaceId, definition.id, receiptId), { status: 404 });
    });
    await t.test('archive restores history without re-opening public access', async () => {
      await forms.archive(owner, workspaceId, definition.id, doc.version);
      const archive = await forms.list(owner, workspaceId, 100, undefined, true); assert.equal(archive.data.length, 1);
      doc = await management.restoreForm(owner, workspaceId, definition.id, archive.data[0].version);
      assert.equal(doc.publishedRevision, null);
      assert.equal((await forms.submissions(owner, workspaceId, definition.id, 100)).data[0].id, receiptId);
    });
    await t.test('retention erases expired answer payloads and keeps non-reusable idempotency tombstones', async () => {
      await management.updateRetention(owner, workspaceId, { responseRetentionDays: 30, trashRetentionDays: 7 });
      await db.submission.update({ where: { id: receiptId }, data: { submittedAt: new Date(Date.now() - 40 * 86400000) } });
      const first = await enforceRetention(db); assert.equal(first.trashed, 1);
      const future = new Date(Date.now() + 8 * 86400000); const next = await enforceRetention(db, future); assert.equal(next.purged, 1);
      const row = await db.submission.findUniqueOrThrow({ where: { id: receiptId } }); assert.equal(row.record, null); assert.ok(row.purgedAt);
      await assert.rejects(management.restoreResponse(owner, workspaceId, definition.id, receiptId), { status: 410 });
    });
    await t.test('encrypted backup authenticates, restores exact records and refuses existing/unsafe targets', async () => {
      const config = { ...backupConfigFromEnvironment(), directory: backupDirectory };
      const manifest = await createBackup(config); const path = join(backupDirectory, `${manifest.file}.json`);
      await verifyBackup(config, path);
      const foreignFile = 'plyli-other-instance.sql.gz.enc';
      const foreignManifest = { ...manifest, sourceDatabase: 'plyli_other_instance', createdAt: '2000-01-01T00:00:00Z', file: foreignFile };
      await writeFile(join(backupDirectory, foreignFile), 'another instance backup');
      await writeFile(join(backupDirectory, `${foreignFile}.json`), JSON.stringify(foreignManifest));
      assert.equal(await pruneBackups({ ...config, retentionDays: 1 }), 0);
      assert.equal(await readFile(join(backupDirectory, foreignFile), 'utf8'), 'another instance backup');
      const target = `plyli_${randomUUID().replaceAll('-', '')}_restore_test`;
      await restoreIntoNewTestDatabase(config, path, target);
      try {
        assert.equal(Number(await mysqlQuery(config, target, `SELECT COUNT(*) FROM Form WHERE workspaceId='${workspaceId}'`)), 2);
        assert.equal(Number(await mysqlQuery(config, target, `SELECT COUNT(*) FROM Submission WHERE id='${receiptId}' AND record IS NULL`)), 1);
        assert.equal(Number(await mysqlQuery(config, target, `SELECT COUNT(*) FROM ApiCredential WHERE workspaceId='${workspaceId}'`)), 1);
        await assert.rejects(restoreIntoNewTestDatabase(config, path, target));
      } finally { await dropRestoreTestDatabase(config, target); }
      await assert.rejects(restoreIntoNewTestDatabase(config, path, 'plyli_dev'));
      await assert.rejects(verifyBackup({ ...config, key: '0'.repeat(64) }, path));
      const data = await readFile(join(backupDirectory, manifest.file)); data[0] ^= 1; await writeFile(join(backupDirectory, manifest.file), data);
      await assert.rejects(verifyBackup(config, path), /checksum/);
    });
  } finally {
    const where = { workspaceId: { in: spaces } };
    await db.analyticsEvent.deleteMany({ where }); await db.submission.deleteMany({ where }); await db.formRevision.deleteMany({ where }); await db.form.deleteMany({ where }); await db.apiCredential.deleteMany({ where }); await db.auditEvent.deleteMany({ where }); await db.membership.deleteMany({ where }); await db.workspace.deleteMany({ where: { id: { in: spaces } } }); await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } }); await db.$disconnect();
    const cleanupTarget = resolve(backupDirectory);
    assert.equal(dirname(cleanupTarget), resolve(tmpdir())); assert.ok(basename(cleanupTarget).startsWith('plyli-backup-test-'));
    await rm(cleanupTarget, { recursive: true, force: true });
  }
});
