import { handleApiRequest } from '@/server/http';
import { getAuth } from '@/server/auth';
import { getConfig } from '@/server/config';
import { db } from '@/server/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleApiRequest(request, (await context.params).path, {
    database: db,
    origin: getConfig().BETTER_AUTH_URL,
    sessionUserId: async (headers) => (await getAuth().api.getSession({ headers }))?.user.id ?? null,
  });
}
export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
