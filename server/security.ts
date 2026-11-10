import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { scopeSchema, resourceId, type ApiScope } from '@/core/contracts';
import { ApiError } from './errors';

export type Principal = { kind: 'session'; userId: string } | { kind: 'key'; credentialId: string; workspaceId: string; scopes: ApiScope[]; formIds: string[] | null };
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
export function generateApiKey() {
  const secret = `plyli_${randomBytes(32).toString('base64url')}`;
  return { secret, hash: hashSecret(secret), prefix: secret.slice(0, 14) };
}

export async function authenticateApiKey(database: PrismaClient, authorization: string): Promise<Principal> {
  const match = /^Bearer (plyli_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) throw new ApiError(401, 'INVALID_CREDENTIAL', 'Invalid API credential.');
  const credential = await database.apiCredential.findUnique({ where: { keyHash: hashSecret(match[1]) } });
  if (!credential || credential.revokedAt || (credential.expiresAt && credential.expiresAt <= new Date())) {
    throw new ApiError(401, 'INVALID_CREDENTIAL', 'Invalid API credential.');
  }
  const scopes = scopeSchema.array().parse(credential.scopes);
  await database.apiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
  const formIds = credential.formIds === null ? null : resourceId.array().parse(credential.formIds);
  return { kind: 'key', credentialId: credential.id, workspaceId: credential.workspaceId, scopes, formIds };
}

export async function authorize(database: PrismaClient, principal: Principal, workspaceId: string, scope: ApiScope, ownerOnly = false) {
  if (principal.kind === 'key') {
    if (principal.workspaceId !== workspaceId) throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.');
    if (ownerOnly || !principal.scopes.includes(scope)) throw new ApiError(403, 'FORBIDDEN', 'Credential does not permit this operation.');
    return;
  }
  const membership = await database.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: principal.userId } } });
  if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.');
  if ((ownerOnly && membership.role !== 'OWNER') || (membership.role === 'VIEWER' && !scope.endsWith(':read'))) {
    throw new ApiError(403, 'FORBIDDEN', 'Your workspace role does not permit this operation.');
  }
}

export async function authorizeForm(database: PrismaClient, principal: Principal, workspaceId: string, formId: string, scope: ApiScope) {
  await authorize(database, principal, workspaceId, scope);
  if (principal.kind === 'key' && principal.formIds !== null && !principal.formIds.includes(formId)) throw new ApiError(404, 'NOT_FOUND', 'Form not found.');
}

export function requireSameOrigin(request: Request, expectedOrigin: string) {
  if (request.headers.get('origin') !== new URL(expectedOrigin).origin) {
    throw new ApiError(403, 'ORIGIN_REJECTED', 'Cookie-authenticated writes require the configured Origin.');
  }
}

// Shared MySQL counters work across workers. Do not trust X-Forwarded-For unless
// the deployment has an explicit trusted proxy; anonymous buckets are form-wide.
export async function consumeRateLimit(database: PrismaClient, identity: string, limit: number, windowSeconds = 60) {
  const now = Date.now();
  const start = Math.floor(now / (windowSeconds * 1000));
  const key = hashSecret(`${identity}:${start}`);
  const expiresAt = new Date((start + 1) * windowSeconds * 1000);
  const count = await database.$transaction(async (tx) => {
    // Prisma's emulated MySQL upsert can race on a bucket's first requests.
    // Hold the native upsert's row lock through the read of this request's count.
    await tx.$executeRaw`INSERT INTO \`RateLimitBucket\` (\`key\`, \`count\`, \`expiresAt\`)
      VALUES (${key}, 1, ${expiresAt}) ON DUPLICATE KEY UPDATE \`count\` = \`count\` + 1`;
    return (await tx.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count;
  });
  if (count > limit) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Retry after the current minute.', { retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)) });
}
