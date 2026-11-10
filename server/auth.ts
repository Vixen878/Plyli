import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { db } from './db';
import { getConfig } from './config';

function createAuth() {
  const config = getConfig();
  return betterAuth({
    appName: 'Plyli',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(db, { provider: 'mysql', transaction: true }),
    trustedOrigins: [new URL(config.BETTER_AUTH_URL).origin],
    onAPIError: { errorURL: '/login/error' },
    socialProviders: config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET ? {
      google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET },
    } : {},
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: process.env.NODE_ENV === 'production' },
    account: { encryptOAuthTokens: true },
    rateLimit: { enabled: true, storage: 'database' },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
