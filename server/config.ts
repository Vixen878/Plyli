import { z } from 'zod';

const configurationSchema = z.object({
  DATABASE_URL: z.string().startsWith('mysql://'),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

export function getConfig() {
  // Lazy configuration permits builds and non-OAuth tests without credentials.
  const result = configurationSchema.safeParse(process.env);
  if (!result.success) throw new Error('Server configuration is incomplete. See .env.example.');
  const config = result.data;
  if (process.env.NODE_ENV === 'production' && !config.BETTER_AUTH_URL.startsWith('https://')) {
    throw new Error('Production authentication requires HTTPS.');
  }
  if (Boolean(config.GOOGLE_CLIENT_ID) !== Boolean(config.GOOGLE_CLIENT_SECRET)) {
    throw new Error('Configure both Google OAuth values.');
  }
  return config;
}
