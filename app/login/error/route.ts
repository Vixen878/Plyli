import { getConfig } from '@/server/config';

// Discard provider diagnostics instead of rendering or forwarding them to users.
export function GET() {
  return Response.redirect(new URL('/login?error=sign_in_failed', getConfig().BETTER_AUTH_URL), 303);
}
