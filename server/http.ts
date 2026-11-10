import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { pageQuerySchema, resourceId, versionSchema } from '@/core/contracts';
import { ApiError } from './errors';
import { FormService } from './forms';
import { ManagementService } from './management';
import { authenticateApiKey, consumeRateLimit, requireSameOrigin, type Principal } from './security';

export interface ApiDependencies {
  database: PrismaClient;
  sessionUserId: (headers: Headers) => Promise<string | null>;
  origin: string;
}

export async function readJson(request: Request, maxBytes = 1024 * 1024): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  if (request.headers.get('content-encoding') && request.headers.get('content-encoding') !== 'identity') throw new ApiError(415, 'UNSUPPORTED_ENCODING', 'Compressed request bodies are not supported.');
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A JSON body is required.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'Body must contain valid UTF-8 JSON.');
  } finally { reader.releaseLock(); }
}

export function errorResponse(error: unknown, requestId: string) {
  let result: ApiError;
  if (error instanceof ApiError) result = error;
  else if (error instanceof z.ZodError) result = new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', error.issues.map((i) => ({ path: i.path, message: i.message })));
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') result = new ApiError(409, 'RESOURCE_CONFLICT', 'An identifier already exists. No records were overwritten.');
  else if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2034'].includes(error.code)) result = new ApiError(409, 'WRITE_CONFLICT', 'The operation conflicts with retained history or another write.');
  else if (error instanceof Prisma.PrismaClientInitializationError) result = new ApiError(503, 'DATABASE_UNAVAILABLE', 'Plyli is temporarily unavailable. Please try again.');
  else {
    // Log only an error class and correlation ID, never bodies/answers/credentials.
    console.error(JSON.stringify({ requestId, errorType: error instanceof Error ? error.name : 'UnknownError' }));
    result = new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
  }
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Request-Id': requestId };
  if (result.status === 429) headers['Retry-After'] = '60';
  return Response.json({ error: { code: result.code, message: result.message, requestId, ...(result.details ? { details: result.details } : {}) } }, { status: result.status, headers });
}

export async function handleApiRequest(request: Request, path: string[], deps: ApiDependencies): Promise<Response> {
  const requestId = randomUUID();
  const reply = (data: unknown, status = 200) => Response.json({ data }, { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
  const method = request.method;
  const service = new FormService(deps.database);
  const management = new ManagementService(deps.database);
  try {
    if (path[0] === 'public' && path[1] === 'forms' && path[2]) {
      const slug = resourceId.parse(path[2]);
      await consumeRateLimit(deps.database, 'public:global', 1200);
      await consumeRateLimit(deps.database, `public:${slug}:${method === 'GET' ? 'read' : 'write'}`, method === 'GET' ? 300 : 60);
      if (path.length === 3 && method === 'GET') return reply((await service.getPublished(slug)).definition);
      if (path.length === 4 && path[3] === 'submissions' && method === 'POST') {
        const idempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/).parse(request.headers.get('idempotency-key'));
        const result = await service.submit(slug, await readJson(request, 128 * 1024), idempotencyKey);
        return reply(result, result.replayed ? 200 : 201);
      }
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported public operation.');
    }

    let principal: Principal;
    const authorization = request.headers.get('authorization');
    if (authorization !== null) {
      await consumeRateLimit(deps.database, 'credential:attempts', 600);
      principal = await authenticateApiKey(deps.database, authorization);
    } else {
      const userId = await deps.sessionUserId(request.headers);
      if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      principal = { kind: 'session', userId };
      if (!['GET', 'HEAD'].includes(method)) requireSameOrigin(request, deps.origin);
    }
    const identity = principal.kind === 'session' ? principal.userId : principal.credentialId;
    await consumeRateLimit(deps.database, `authenticated:${identity}`, 120);

    if (path.join('/') === 'workspaces/personal' && method === 'POST') {
      if (principal.kind !== 'session') throw new ApiError(403, 'FORBIDDEN', 'Workspace provisioning requires a session.');
      z.strictObject({}).parse(await readJson(request, 1024));
      return reply(await service.provisionWorkspace(principal.userId));
    }
    if (path[0] !== 'workspaces' || !path[1]) throw new ApiError(404, 'NOT_FOUND', 'API route not found.');
    const workspaceId = resourceId.parse(path[1]);
    const query = new URL(request.url).searchParams;
    if (path[2] === 'retention' && path.length === 3) {
      if (method === 'GET') return reply(await management.retention(principal, workspaceId));
      if (method === 'PUT') return reply(await management.updateRetention(principal, workspaceId, await readJson(request, 4096)));
    }
    if (path[2] === 'imports' && path.length === 3 && method === 'POST') return reply(await service.importBackup(principal, workspaceId, await readJson(request, 5 * 1024 * 1024)), 201);
    if (path[2] === 'keys') {
      if (path.length === 3 && method === 'GET') {
        const page = pageQuerySchema.parse(Object.fromEntries(query));
        return Response.json(await management.keys(principal, workspaceId, page.limit, page.cursor), { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
      }
      if (path.length === 3 && method === 'POST') return reply(await service.createKey(principal, workspaceId, await readJson(request, 4096)), 201);
      if (path.length === 4 && method === 'DELETE') { await service.revokeKey(principal, workspaceId, resourceId.parse(path[3])); return reply({ revoked: true }); }
    }
    if (path[2] !== 'forms') throw new ApiError(404, 'NOT_FOUND', 'API route not found.');
    if (path.length === 3) {
      if (method === 'GET') {
        const pagination = pageQuerySchema.parse(Object.fromEntries(query));
        const page = await service.list(principal, workspaceId, pagination.limit, pagination.cursor, query.get('archived') === 'true');
        return Response.json(page, { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
      }
      if (method === 'POST') return reply(await service.create(principal, workspaceId, await readJson(request)), 201);
    }
    if (!path[3]) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported form operation.');
    const formId = resourceId.parse(path[3]);
    if (path.length === 5 && path[4] === 'integration') {
      if (method === 'GET') return reply(await management.integration(principal, workspaceId, formId));
      if (method === 'PUT') return reply(await management.updateIntegration(principal, workspaceId, formId, await readJson(request, 16384)));
    }
    if (path.length === 5 && path[4] === 'restore' && method === 'POST') {
      const { expectedVersion } = versionSchema.parse(await readJson(request, 1024));
      return reply(await management.restoreForm(principal, workspaceId, formId, expectedVersion));
    }
    if (path.length === 5 && path[4] === 'published' && method === 'GET') return reply(await service.published(principal, workspaceId, formId));
    if (path.length === 5 && path[4] === 'validate' && method === 'POST') return reply(await service.validateAnswers(principal, workspaceId, formId, await readJson(request, 128 * 1024)));
    if (path.length === 5 && path[4] === 'submissions' && method === 'POST') {
      const key = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/).parse(request.headers.get('idempotency-key'));
      const result = await service.integrationSubmit(principal, workspaceId, formId, await readJson(request, 128 * 1024), key);
      return reply(result, result.replayed ? 200 : 201);
    }
    if (path.length === 5 && path[4] === 'submissions' && method === 'DELETE') return reply(await management.trashResponses(principal, workspaceId, formId));
    if (path.length === 6 && path[4] === 'submissions' && path[5] === 'trash' && method === 'GET') {
      const page = pageQuerySchema.parse(Object.fromEntries(query));
      return Response.json(await management.trashedResponses(principal, workspaceId, formId, page.limit, page.cursor), { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
    }
    if (path.length === 6 && path[4] === 'submissions' && method === 'DELETE') return reply(await management.trashResponses(principal, workspaceId, formId, resourceId.parse(path[5])));
    if (path.length === 7 && path[4] === 'submissions' && path[6] === 'restore' && method === 'POST') return reply(await management.restoreResponse(principal, workspaceId, formId, resourceId.parse(path[5])));
    if (path.length === 4) {
      if (method === 'GET') return reply(await service.get(principal, workspaceId, formId));
      if (method === 'PUT') return reply(await service.update(principal, workspaceId, formId, await readJson(request)));
      if (method === 'DELETE') {
        const { expectedVersion } = versionSchema.parse(await readJson(request, 1024));
        await service.archive(principal, workspaceId, formId, expectedVersion);
        return reply({ archived: true });
      }
    }
    if (path.length === 5 && ['publish', 'unpublish'].includes(path[4]) && method === 'POST') {
      const { expectedVersion } = versionSchema.parse(await readJson(request, 1024));
      return reply(await service.publish(principal, workspaceId, formId, expectedVersion, path[4] === 'publish'));
    }
    if (path.length === 5 && path[4] === 'submissions' && method === 'GET') {
      const pagination = pageQuerySchema.parse(Object.fromEntries(query));
      return Response.json(await service.submissions(principal, workspaceId, formId, pagination.limit, pagination.cursor), { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
    }
    if (path.length === 5 && path[4] === 'analytics-events' && method === 'GET') {
      const pagination = pageQuerySchema.parse(Object.fromEntries(query));
      return Response.json(await service.analyticsEvents(principal, workspaceId, formId, pagination.limit, pagination.cursor), { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
    }
    if (path.length === 5 && path[4] === 'revisions' && method === 'GET') {
      const pagination = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.coerce.number().int().positive().optional() }).parse(Object.fromEntries(query));
      return Response.json(await service.revisions(principal, workspaceId, formId, pagination.limit, pagination.cursor), { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
    }
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Unsupported API operation.');
  } catch (error) { return errorResponse(error, requestId); }
}
