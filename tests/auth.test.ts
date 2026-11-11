import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { getAuth } from '@/server/auth';
import { handleApiRequest } from '@/server/http';
import { GET as signInErrorRedirect } from '@/app/login/error/route';

test('Better Auth Prisma sessions enforce signed, unexpired cookies and sign-out', async () => {
  assert.ok(new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test'));
  const id = randomUUID(); const token = randomUUID();
  const secret = process.env.BETTER_AUTH_SECRET;
  assert.ok(secret);
  const auth = getAuth();
  const origin = process.env.BETTER_AUTH_URL;
  assert.ok(origin);
  const providerError = await auth.handler(new Request(`${origin}/api/auth/error?error=PROVIDER_ERROR&error_description=internal-provider-detail`));
  assert.equal(providerError.status, 302);
  const providerLocation = providerError.headers.get('location');
  assert.ok(providerLocation);
  assert.equal(new URL(providerLocation, origin).pathname, '/login/error');
  const cleanRedirect = signInErrorRedirect(new Request(`${origin}/login/error?next=//example.invalid&error_description=internal-provider-detail`));
  assert.equal(cleanRedirect.status, 303);
  assert.equal(cleanRedirect.headers.get('location'), `${origin}/login?error=sign_in_failed`);
  const retry = signInErrorRedirect(new Request(`${origin}/login/error?next=%2Ff%2Fevent-rsvp&error_description=private`));
  assert.equal(retry.headers.get('location'), `${origin}/login?error=sign_in_failed&next=%2Ff%2Fevent-rsvp`);
  const signed = encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`);
  const cookie = `better-auth.session_token=${signed}`;
  try {
    await db.user.create({ data: { id, name: 'Session fixture', email: `${id}@example.invalid` } });
    await db.session.create({ data: { id: randomUUID(), token, userId: id, expiresAt: new Date(Date.now() + 3600000) } });
    assert.equal(await auth.api.getSession({ headers: new Headers() }), null);
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: 'better-auth.session_token=forged' }) }), null);
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session?.user.id, id);
    const profileChange = await auth.handler(new Request(`${origin}/api/auth/update-user`, {
      method: 'POST', headers: { cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated fixture profile' }),
    }));
    assert.equal(profileChange.status, 200);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).name, 'Updated fixture profile');
    const deps = { database: db, origin, sessionUserId: async (headers: Headers) => (await auth.api.getSession({ headers }))?.user.id ?? null };
    const denied = await handleApiRequest(new Request(`${origin}/api/v1/workspaces/personal`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: origin } }), ['workspaces', 'personal'], deps);
    assert.equal(denied.status, 401);
    const signout = await auth.handler(new Request(`${origin}/api/auth/sign-out`, { method: 'POST', headers: { cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(signout.status, 200);
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
    assert.equal(await db.session.count({ where: { token } }), 0);
    await db.session.create({ data: { id: randomUUID(), token, userId: id, expiresAt: new Date(0) } });
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  } finally {
    await db.session.deleteMany({ where: { userId: id } }); await db.user.deleteMany({ where: { id } }); await db.$disconnect();
  }
});
