import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  formDefinitionSchema, publishableFormSchema, responseRecordSchema, revisionSnapshotSchema,
  createFormSchema, updateFormSchema, submissionInputSchema, importBackupSchema,
  createKeySchema, analyticsEventSchema, type FormDocument, type ImportBackup,
} from '@/core/contracts';
import { processFormSubmission } from '@/core/submissions';
import { validateSubmission } from '@/core/validation';
import { parseIntegrationPolicy, validateContext } from '@/core/integration-policy';
import { sanitizeSessionAttribution } from '@/core/attribution';
import type { FormSchema } from '@/core/types';
import { ApiError } from './errors';
import { authorize, authorizeForm, generateApiKey, hashSecret, type Principal } from './security';

export const jsonValue = (value: unknown): Prisma.InputJsonValue => {
  const parsed = z.json().parse(JSON.parse(JSON.stringify(value)));
  if (parsed === null) throw new Error('Expected a JSON document.');
  return parsed;
};
const actorId = (p: Principal) => p.kind === 'session' ? p.userId : p.credentialId;
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Form not found.');
const conflict = () => new ApiError(409, 'VERSION_CONFLICT', 'The form changed. Reload before saving; your edits have not been overwritten.');

export class FormService {
  constructor(readonly database: PrismaClient) {}

  async provisionWorkspace(userId: string) {
    const workspace = await this.database.$transaction(async (tx) => {
      // The user row already exists on the first visit. Lock it before checking for a workspace.
      await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${userId} FOR UPDATE`;
      const existing = await tx.workspace.findUnique({ where: { personalOwnerId: userId } });
      if (existing) return existing;
      return tx.workspace.create({
        data: { name: 'My workspace', personalOwnerId: userId, memberships: { create: { userId, role: 'OWNER' } } },
      });
    });
    return { id: workspace.id, name: workspace.name, role: 'OWNER' as const };
  }

  private async document(row: { workspaceId: string; id: string; draftRevision: number; version: number; publicSlug: string; publishedRevision: number | null; archivedAt: Date | null }): Promise<FormDocument> {
    const revision = await this.database.formRevision.findUniqueOrThrow({ where: { workspaceId_formId_revision: { workspaceId: row.workspaceId, formId: row.id, revision: row.draftRevision } } });
    const responseCount = await this.database.submission.count({ where: { workspaceId: row.workspaceId, formId: row.id, deletedAt: null } });
    return { definition: formDefinitionSchema.parse(revision.definition), version: row.version, publicSlug: row.publicSlug, publishedRevision: row.publishedRevision, archivedAt: row.archivedAt?.toISOString() ?? null, responseCount };
  }

  async list(principal: Principal, workspaceId: string, limit: number, cursor?: string, archived = false) {
    await authorize(this.database, principal, workspaceId, 'forms:read');
    const rows = await this.database.form.findMany({
      where: { workspaceId, archivedAt: archived ? { not: null } : null, ...(principal.kind === 'key' && principal.formIds ? { id: { in: principal.formIds, ...(cursor ? { gt: cursor } : {}) } } : cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return { data: await Promise.all(page.map((row) => this.document(row))), nextCursor: rows.length > limit ? page.at(-1)?.id ?? null : null };
  }

  async get(principal: Principal, workspaceId: string, formId: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'forms:read');
    return this.getDocument(workspaceId, formId);
  }

  private async getDocument(workspaceId: string, formId: string) {
    const form = await this.database.form.findFirst({ where: { workspaceId, id: formId, archivedAt: null } });
    if (!form) throw notFound();
    return this.document(form);
  }

  async create(principal: Principal, workspaceId: string, input: unknown) {
    await authorize(this.database, principal, workspaceId, 'forms:write');
    if (principal.kind === 'key' && principal.formIds !== null) throw new ApiError(403, 'FORBIDDEN', 'Form-bound credentials cannot create new forms.');
    const { definition: submitted } = createFormSchema.parse(input);
    const now = new Date().toISOString();
    const definition: FormSchema = { ...submitted, revision: 1, createdAt: now, updatedAt: now };
    await this.database.$transaction(async (tx) => {
      await tx.form.create({ data: {
        id: definition.id, workspaceId, title: definition.title,
        revisions: { create: { revision: 1, definition: jsonValue(definition) } },
      } });
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'form.create', resourceId: definition.id } });
    });
    return this.getDocument(workspaceId, definition.id);
  }

  async update(principal: Principal, workspaceId: string, formId: string, input: unknown) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'forms:write');
    const { definition: submitted, expectedVersion } = updateFormSchema.parse(input);
    if (submitted.id !== formId) throw new ApiError(422, 'INVALID_DEFINITION', 'Definition ID must match the URL.');
    await this.database.$transaction(async (tx) => {
      const current = await tx.form.findFirst({ where: { workspaceId, id: formId, archivedAt: null } });
      if (!current) throw notFound();
      if (current.version !== expectedVersion) throw conflict();
      const old = await tx.formRevision.findUniqueOrThrow({ where: { workspaceId_formId_revision: { workspaceId, formId, revision: current.draftRevision } } });
      const existing = formDefinitionSchema.parse(old.definition);
      const revision = current.draftRevision + 1;
      const definition: FormSchema = { ...submitted, revision, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
      const write = await tx.form.updateMany({ where: { workspaceId, id: formId, version: expectedVersion, archivedAt: null }, data: { version: { increment: 1 }, draftRevision: revision, title: definition.title } });
      if (write.count !== 1) throw conflict();
      await tx.formRevision.create({ data: { workspaceId, formId, revision, definition: jsonValue(definition) } });
    });
    return this.getDocument(workspaceId, formId);
  }

  async publish(principal: Principal, workspaceId: string, formId: string, expectedVersion: number, publish = true) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'forms:publish');
    await this.database.$transaction(async (tx) => {
      const current = await tx.form.findFirst({ where: { workspaceId, id: formId, archivedAt: null } });
      if (!current) throw notFound();
      if (publish) {
        const snapshot = await tx.formRevision.findUniqueOrThrow({ where: { workspaceId_formId_revision: { workspaceId, formId, revision: current.draftRevision } } });
        publishableFormSchema.parse(snapshot.definition);
      }
      const result = await tx.form.updateMany({ where: { workspaceId, id: formId, version: expectedVersion, archivedAt: null }, data: { publishedRevision: publish ? current.draftRevision : null, version: { increment: 1 } } });
      if (result.count !== 1) throw conflict();
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: publish ? 'form.publish' : 'form.unpublish', resourceId: formId } });
    });
    return this.getDocument(workspaceId, formId);
  }

  async archive(principal: Principal, workspaceId: string, formId: string, expectedVersion: number) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'forms:write');
    await this.database.$transaction(async (tx) => {
      const result = await tx.form.updateMany({ where: { workspaceId, id: formId, version: expectedVersion, archivedAt: null }, data: { archivedAt: new Date(), publishedRevision: null, version: { increment: 1 } } });
      if (!result.count) {
        if (!await tx.form.findFirst({ where: { workspaceId, id: formId } })) throw notFound();
        throw conflict();
      }
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'form.archive', resourceId: formId } });
    });
  }

  async revisions(principal: Principal, workspaceId: string, formId: string, limit: number, cursor?: number) {
    await this.get(principal, workspaceId, formId);
    const rows = await this.database.formRevision.findMany({ where: { workspaceId, formId, ...(cursor ? { revision: { gt: cursor } } : {}) }, orderBy: { revision: 'asc' }, take: limit + 1 });
    return {
      data: rows.slice(0, limit).map((r) => ({ revision: r.revision, definition: r.definition ? formDefinitionSchema.parse(r.definition) : null, legacySnapshot: r.legacySnapshot ? revisionSnapshotSchema.parse(r.legacySnapshot) : null })),
      nextCursor: rows.length > limit ? rows[limit - 1].revision : null,
    };
  }

  async getPublished(slug: string, principal?: Principal) {
    const form = await this.database.form.findFirst({ where: { publicSlug: slug, archivedAt: null, publishedRevision: { not: null } } });
    if (!form || form.publishedRevision === null) throw notFound();
    if (principal) await authorizeForm(this.database, principal, form.workspaceId, form.id, 'forms:read');
    else if (parseIntegrationPolicy(form.integrationPolicy).mode === 'private') throw notFound();
    const revision = await this.database.formRevision.findUniqueOrThrow({ where: { workspaceId_formId_revision: { workspaceId: form.workspaceId, formId: form.id, revision: form.publishedRevision } } });
    return { form, definition: publishableFormSchema.parse(revision.definition) };
  }

  async submit(slug: string, input: unknown, idempotencyKey: string, principal?: Principal) {
    const payload = submissionInputSchema.parse(input);
    // Submission-only credentials need not also receive draft/read privileges.
    const formRow = await this.database.form.findFirst({ where: { publicSlug: slug, archivedAt: null, publishedRevision: { not: null } } });
    if (!formRow || formRow.publishedRevision === null) throw notFound();
    if (principal) await authorizeForm(this.database, principal, formRow.workspaceId, formRow.id, 'submissions:write');
    else if (parseIntegrationPolicy(formRow.integrationPolicy).mode === 'private') throw notFound();
    const stored = await this.database.formRevision.findUniqueOrThrow({ where: { workspaceId_formId_revision: { workspaceId: formRow.workspaceId, formId: formRow.id, revision: formRow.publishedRevision } } });
    const form = formRow; const definition = publishableFormSchema.parse(stored.definition);
    const requestHash = hashSecret(JSON.stringify(payload));
    return this.database.$transaction(async (tx) => {
      // A locking current read serializes against publish/unpublish/archive.
      await tx.$queryRaw`SELECT id FROM Form WHERE id = ${form.id} AND workspaceId = ${form.workspaceId} FOR UPDATE`;
      const current = await tx.form.findFirst({ where: { workspaceId: form.workspaceId, id: form.id, archivedAt: null } });
      if (!current || current.publishedRevision === null) throw notFound();
      const policy = parseIntegrationPolicy(current.integrationPolicy);
      if (!principal && policy.mode === 'private') throw notFound();
      const context = validateContext(policy, payload.externalContext, Boolean(principal));
      if (!context.valid) throw new ApiError(422, 'INVALID_CONTEXT', 'Contextual metadata does not match the form allowlist.', context.errors);
      const existing = await tx.submission.findUnique({ where: { workspaceId_formId_idempotencyKey: { workspaceId: form.workspaceId, formId: form.id, idempotencyKey } } });
      if (existing) {
        if (existing.deletedAt) throw new ApiError(410, 'SUBMISSION_DELETED', 'This submission was deleted; its idempotency key cannot be reused.');
        if (existing.requestHash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for another payload.');
        return { id: existing.id, formRevision: existing.formRevision, submittedAt: existing.submittedAt.toISOString(), replayed: true };
      }
      if (payload.revision !== current.publishedRevision || current.publishedRevision !== definition.revision) {
        throw new ApiError(409, 'REVISION_CHANGED', 'The published form changed. Reload before submitting.');
      }
      const result = processFormSubmission(definition, payload.answers, {
        durationSeconds: payload.durationSeconds ?? 0,
        attribution: payload.attribution ? sanitizeSessionAttribution(payload.attribution) ?? undefined : undefined,
        viewport: payload.viewport, sessionId: payload.sessionId, sessionSource: 'public_live',
        externalContext: context.context,
      });
      if (!result.valid || !result.record) throw new ApiError(422, 'INVALID_ANSWERS', 'Please correct your answers.', result.errors);
      const record = responseRecordSchema.parse({ ...result.record, id: randomUUID() });
      await tx.submission.create({ data: { id: record.id, workspaceId: form.workspaceId, formId: form.id, formRevision: definition.revision, submittedAt: new Date(record.submittedAt), record: jsonValue(record), idempotencyKey, requestHash } });
      return { id: record.id, formRevision: record.formRevision, submittedAt: record.submittedAt, replayed: false };
    });
  }

  async published(principal: Principal, workspaceId: string, formId: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'forms:read');
    const form = await this.database.form.findFirst({ where: { workspaceId, id: formId, archivedAt: null } });
    if (!form) throw notFound();
    return (await this.getPublished(form.publicSlug, principal)).definition;
  }

  async integrationSubmit(principal: Principal, workspaceId: string, formId: string, input: unknown, key: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'submissions:write');
    const form = await this.database.form.findFirst({ where: { workspaceId, id: formId, archivedAt: null } });
    if (!form) throw notFound();
    return this.submit(form.publicSlug, input, key, principal);
  }

  async validateAnswers(principal: Principal, workspaceId: string, formId: string, input: unknown) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'submissions:write');
    const payload = submissionInputSchema.parse(input);
    const form = await this.database.form.findFirst({ where: { workspaceId, id: formId, archivedAt: null, publishedRevision: payload.revision } });
    if (!form) throw new ApiError(409, 'REVISION_CHANGED', 'The form is unavailable or the published revision changed.');
    const row = await this.database.formRevision.findUniqueOrThrow({ where: { workspaceId_formId_revision: { workspaceId, formId, revision: payload.revision } } });
    const validation = validateSubmission(publishableFormSchema.parse(row.definition), payload.answers);
    const context = validateContext(parseIntegrationPolicy(form.integrationPolicy), payload.externalContext, true);
    return { ...validation, valid: validation.valid && context.valid, contextErrors: context.errors };
  }

  async submissions(principal: Principal, workspaceId: string, formId: string, limit: number, cursor?: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'submissions:read');
    if (!await this.database.form.findFirst({ where: { workspaceId, id: formId } })) throw notFound();
    const rows = await this.database.submission.findMany({ where: { workspaceId, formId, deletedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1 });
    return { data: rows.slice(0, limit).map((r) => responseRecordSchema.parse(r.record)), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  }

  async analyticsEvents(principal: Principal, workspaceId: string, formId: string, limit: number, cursor?: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'analytics:read');
    if (!await this.database.form.findFirst({ where: { workspaceId, id: formId } })) throw notFound();
    const rows = await this.database.analyticsEvent.findMany({ where: { workspaceId, formId, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1 });
    return { data: rows.slice(0, limit).map((r) => analyticsEventSchema.parse(r.event)), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  }

  async createKey(principal: Principal, workspaceId: string, input: unknown) {
    await authorize(this.database, principal, workspaceId, 'forms:write', true);
    const data = createKeySchema.parse(input);
    if (data.formIds && await this.database.form.count({ where: { workspaceId, id: { in: [...new Set(data.formIds)] } } }) !== new Set(data.formIds).size) throw new ApiError(422, 'INVALID_FORM_ACCESS', 'Choose forms from this workspace.');
    if (data.expiresAt && new Date(data.expiresAt) <= new Date()) throw new ApiError(422, 'INVALID_EXPIRY', 'Expiry must be in the future.');
    const key = generateApiKey();
    const credential = await this.database.$transaction(async (tx) => {
      const row = await tx.apiCredential.create({ data: { workspaceId, createdBy: actorId(principal), name: data.name, keyHash: key.hash, prefix: key.prefix, scopes: data.scopes, formIds: data.formIds ?? Prisma.DbNull, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } });
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'credential.create', resourceId: row.id } });
      return row;
    });
    return { id: credential.id, secret: key.secret, prefix: key.prefix, scopes: data.scopes, expiresAt: credential.expiresAt?.toISOString() ?? null };
  }

  async revokeKey(principal: Principal, workspaceId: string, credentialId: string) {
    await authorize(this.database, principal, workspaceId, 'forms:write', true);
    await this.database.$transaction(async (tx) => {
      const result = await tx.apiCredential.updateMany({ where: { id: credentialId, workspaceId }, data: { revokedAt: new Date() } });
      if (!result.count) throw new ApiError(404, 'NOT_FOUND', 'Credential not found.');
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'credential.revoke', resourceId: credentialId } });
    });
  }

  async importBackup(principal: Principal, workspaceId: string, input: unknown) {
    await authorize(this.database, principal, workspaceId, 'forms:write');
    if (principal.kind !== 'session') throw new ApiError(403, 'FORBIDDEN', 'Account imports require a dashboard session.');
    const backup = importBackupSchema.parse(input);
    validateBackupIntegrity(backup);
    await this.database.$transaction(async (tx) => {
      for (const definition of backup.forms) {
        await tx.form.create({ data: { id: definition.id, workspaceId, title: definition.title, draftRevision: definition.revision, createdAt: new Date(definition.createdAt), revisions: { create: { revision: definition.revision, definition: jsonValue(definition) } } } });
      }
      for (const snapshot of backup.revisions) {
        const current = backup.forms.find((f) => f.id === snapshot.formId);
        if (current?.revision === snapshot.revision) {
          // Preserve even same-revision snapshots: local code could edit a revision
          // without bumping it before receiving its first response.
          await tx.formRevision.update({ where: { workspaceId_formId_revision: { workspaceId, formId: snapshot.formId, revision: snapshot.revision } }, data: { legacySnapshot: jsonValue(snapshot) } });
        } else {
          await tx.formRevision.create({ data: { workspaceId, formId: snapshot.formId, revision: snapshot.revision, legacySnapshot: jsonValue(snapshot) } });
        }
      }
      for (const definition of backup.fullRevisions) {
        const current = backup.forms.find((f) => f.id === definition.id);
        if (current?.revision === definition.revision) continue;
        const key = { workspaceId, formId: definition.id, revision: definition.revision };
        const exists = await tx.formRevision.findUnique({ where: { workspaceId_formId_revision: key } });
        if (exists) await tx.formRevision.update({ where: { workspaceId_formId_revision: key }, data: { definition: jsonValue(definition) } });
        else await tx.formRevision.create({ data: { ...key, definition: jsonValue(definition) } });
      }
      for (const record of backup.responses) {
        await tx.submission.create({ data: { id: record.id, workspaceId, formId: record.formId, formRevision: record.formRevision, submittedAt: new Date(record.submittedAt), record: jsonValue(record) } });
      }
      for (const event of backup.analyticsEvents) {
        const clean = analyticsEventSchema.parse(event);
        await tx.analyticsEvent.create({ data: { id: clean.id, workspaceId, formId: clean.formId, formRevision: clean.formRevision, sessionId: clean.sessionId, type: clean.type, occurredAt: new Date(clean.timestamp), event: jsonValue(clean) } });
      }
      await tx.auditEvent.create({ data: { workspaceId, actorId: principal.userId, action: 'workspace.import', resourceId: workspaceId } });
    }, { timeout: 30000 });
    return { forms: backup.forms.length, responses: backup.responses.length, revisions: backup.revisions.length, analyticsEvents: backup.analyticsEvents.length };
  }
}

export function validateBackupIntegrity(backup: ImportBackup) {
  const reject = (message: string) => { throw new ApiError(422, 'INVALID_BACKUP', message); };
  for (const [name, ids] of [
    ['forms', backup.forms.map((f) => f.id)], ['responses', backup.responses.map((r) => r.id)],
    ['revisions', backup.revisions.map((r) => `${r.formId}:${r.revision}`)], ['analyticsEvents', backup.analyticsEvents.map((e) => e.id)],
    ['fullRevisions', backup.fullRevisions.map((f) => `${f.id}:${f.revision}`)],
  ] as const) { if (new Set(ids).size !== ids.length) reject(`Duplicate IDs in ${name}. No records were imported.`); }
  const forms = new Map(backup.forms.map((f) => [f.id, f]));
  const snapshots = new Map(backup.revisions.map((r) => [`${r.formId}:${r.revision}`, r]));
  const fullRevisions = new Set(backup.fullRevisions.map((f) => `${f.id}:${f.revision}`));
  for (const definition of backup.fullRevisions) {
    const form = forms.get(definition.id);
    if (!form || definition.revision > form.revision) { reject('Full revision has no matching form or exceeds its current revision.'); continue; }
    if (definition.revision === form.revision && JSON.stringify(definition) !== JSON.stringify(form)) reject('Current and full revision definitions conflict.');
  }
  for (const snapshot of backup.revisions) {
    const form = forms.get(snapshot.formId);
    if (!form || snapshot.revision > form.revision) reject('Revision snapshot has no matching form or exceeds its current revision.');
  }
  for (const record of [...backup.responses, ...backup.analyticsEvents]) {
    const form = forms.get(record.formId);
    if (!form || (record.formRevision !== form.revision && !snapshots.has(`${record.formId}:${record.formRevision}`) && !fullRevisions.has(`${record.formId}:${record.formRevision}`))) {
      reject(`Missing historical revision for ${record.id}. Export a complete backup; no records were imported.`);
    }
  }
}
