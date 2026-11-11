import { getConfig } from '@/server/config';
import { authDestination } from '@/lib/auth-destination';

// Discard provider diagnostics instead of rendering or forwarding them to users.
export function GET(request: Request) {
  const url = new URL('/login?error=sign_in_failed', getConfig().BETTER_AUTH_URL);
  const next = authDestination(new URL(request.url).searchParams.get('next'));
  if (next !== '/dashboard') url.searchParams.set('next', next);
  return Response.redirect(url, 303);
}
