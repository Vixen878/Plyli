import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { getAuth } from '@/server/auth';
import { getConfig } from '@/server/config';
import { FormService } from '@/server/forms';
import { ApiError } from '@/server/errors';
import { errorResponse, readJson } from '@/server/http';
import { consumeRateLimit, requireSameOrigin } from '@/server/security';
import { resourceId } from '@/core/contracts';

export const runtime = 'nodejs';

async function sharing(request: Request, { params }: { params: Promise<{ workspaceId: string; formId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const { workspaceId, formId } = await params;
    const workspace = resourceId.parse(workspaceId);
    const form = resourceId.parse(formId);
    const principal = { kind: 'session' as const, userId: session.user.id };
    const service = new FormService(db);
    if (request.method === 'PUT') requireSameOrigin(request, getConfig().BETTER_AUTH_URL);
    await consumeRateLimit(db, `authenticated:${principal.userId}`, 120);
    const data = request.method === 'PUT'
      ? await service.updateSharing(principal, workspace, form, await readJson(request, 8192))
      : await service.sharing(principal, workspace, form);
    return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error, randomUUID());
  }
}

export { sharing as GET, sharing as PUT };
