import { Prisma, type PrismaClient } from '@prisma/client';
import { resourceId, keyInfoSchema, integrationSettingsSchema, retentionSettingsSchema, responseRecordSchema } from '@/core/contracts';
import { parseIntegrationPolicy } from '@/core/integration-policy';
import { authorize, authorizeForm, type Principal } from './security';
import { ApiError } from './errors';
import { FormService, jsonValue } from './forms';

const actorId = (p: Principal) => p.kind === 'session' ? p.userId : p.credentialId;
export class ManagementService {
  constructor(readonly database: PrismaClient) {}
  async keys(principal: Principal, workspaceId: string, limit: number, cursor?: string) {
    await authorize(this.database, principal, workspaceId, 'forms:write', true);
    const rows = await this.database.apiCredential.findMany({ where: { workspaceId, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1,
      select: { id: true, name: true, prefix: true, scopes: true, formIds: true, expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true } });
    return { data: rows.slice(0, limit).map((row) => keyInfoSchema.parse({ ...row, formIds: row.formIds === null ? null : resourceId.array().parse(row.formIds), expiresAt: row.expiresAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null, lastUsedAt: row.lastUsedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  }
  async integration(principal: Principal, workspaceId: string, formId: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'forms:read');
    const form = await this.database.form.findFirst({ where: { workspaceId, id: formId } });
    if (!form) throw new ApiError(404, 'NOT_FOUND', 'Form not found.');
    return { version: form.version, policy: parseIntegrationPolicy(form.integrationPolicy) };
  }
  async updateIntegration(principal: Principal, workspaceId: string, formId: string, input: unknown) {
    // Security policies belong to workspace owners, never to an external API key.
    await authorize(this.database, principal, workspaceId, 'forms:write', true);
    const { expectedVersion, policy } = integrationSettingsSchema.parse(input);
    await this.database.$transaction(async (tx) => {
      const result = await tx.form.updateMany({ where: { workspaceId, id: formId, version: expectedVersion, archivedAt: null }, data: { integrationPolicy: jsonValue(policy), version: { increment: 1 } } });
      if (!result.count) throw new ApiError(409, 'VERSION_CONFLICT', 'Form settings changed. Reload the latest settings before saving.');
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'form.integration-policy', resourceId: formId } });
    });
    return this.integration(principal, workspaceId, formId);
  }
  async restoreForm(principal: Principal, workspaceId: string, formId: string, expectedVersion: number) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'forms:write');
    await this.database.$transaction(async (tx) => {
      const result = await tx.form.updateMany({ where: { workspaceId, id: formId, version: expectedVersion, archivedAt: { not: null } }, data: { archivedAt: null, publishedRevision: null, version: { increment: 1 } } });
      if (!result.count) throw new ApiError(409, 'VERSION_CONFLICT', 'Archived form changed or has already been restored.');
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'form.restore', resourceId: formId } });
    });
    return new FormService(this.database).get(principal, workspaceId, formId);
  }
  async trashResponses(principal: Principal, workspaceId: string, formId: string, responseId?: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'submissions:delete');
    if (!await this.database.form.findFirst({ where: { workspaceId, id: formId } })) throw new ApiError(404, 'NOT_FOUND', 'Form not found.');
    return this.database.$transaction(async (tx) => {
      const result = await tx.submission.updateMany({ where: { workspaceId, formId, ...(responseId ? { id: responseId } : {}), deletedAt: null }, data: { deletedAt: new Date() } });
      if (responseId && !result.count && !await tx.submission.findFirst({ where: { workspaceId, formId, id: responseId } })) throw new ApiError(404, 'NOT_FOUND', 'Response not found.');
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'response.trash', resourceId: responseId ?? formId } });
      return { deleted: result.count };
    });
  }
  async trashedResponses(principal: Principal, workspaceId: string, formId: string, limit: number, cursor?: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'submissions:read');
    const rows = await this.database.submission.findMany({ where: { workspaceId, formId, deletedAt: { not: null }, purgedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1 });
    return { data: rows.slice(0, limit).map((row) => ({ record: responseRecordSchema.parse(row.record), deletedAt: row.deletedAt?.toISOString() })), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  }
  async restoreResponse(principal: Principal, workspaceId: string, formId: string, responseId: string) {
    await authorizeForm(this.database, principal, workspaceId, formId, 'submissions:delete');
    await this.database.$transaction(async (tx) => {
      const policy = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      const cutoff = new Date(Date.now() - policy.trashRetentionDays * 86400000);
      const result = await tx.submission.updateMany({ where: { workspaceId, formId, id: responseId, deletedAt: { gt: cutoff }, purgedAt: null }, data: { deletedAt: null } });
      if (!result.count) throw new ApiError(410, 'RECOVERY_EXPIRED', 'Response is unavailable or its recovery window has expired.');
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'response.restore', resourceId: responseId } });
    });
    return { restored: true };
  }
  async retention(principal: Principal, workspaceId: string) {
    await authorize(this.database, principal, workspaceId, 'forms:write', true);
    const workspace = await this.database.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    return retentionSettingsSchema.parse({ responseRetentionDays: workspace.responseRetentionDays, trashRetentionDays: workspace.trashRetentionDays });
  }
  async updateRetention(principal: Principal, workspaceId: string, input: unknown) {
    await authorize(this.database, principal, workspaceId, 'forms:write', true);
    const settings = retentionSettingsSchema.parse(input);
    await this.database.$transaction(async (tx) => {
      await tx.workspace.update({ where: { id: workspaceId }, data: settings });
      await tx.auditEvent.create({ data: { workspaceId, actorId: actorId(principal), action: 'workspace.retention', resourceId: workspaceId } });
    });
    return settings;
  }
}

export async function enforceRetention(database: PrismaClient, now = new Date()) {
  let trashed = 0; let purged = 0;
  const spaces = await database.workspace.findMany({ select: { id: true, responseRetentionDays: true, trashRetentionDays: true } });
  for (const space of spaces) {
    if (space.responseRetentionDays !== null) trashed += (await database.submission.updateMany({ where: { workspaceId: space.id, deletedAt: null, submittedAt: { lt: new Date(now.getTime() - space.responseRetentionDays * 86400000) } }, data: { deletedAt: now } })).count;
    purged += (await database.submission.updateMany({ where: { workspaceId: space.id, deletedAt: { lte: new Date(now.getTime() - space.trashRetentionDays * 86400000) }, purgedAt: null }, data: { purgedAt: now, record: Prisma.DbNull } })).count;
  }
  return { trashed, purged };
}
