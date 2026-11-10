import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiReference } from '@/components/api-reference';
import { buildApiReference } from '@/lib/api-reference';
import { createExampleForm } from '@/lib/api-example-form';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'API reference — Plyli', description: 'Integrate Plyli forms, validate answers, and manage responses with the API.' };
export const dynamic = 'force-dynamic';
export default async function ApiReferencePage() {
  const raw: unknown = JSON.parse(await readFile(join(process.cwd(), 'public/openapi.json'), 'utf8'));
  const form = createExampleForm();
  return <ApiReference data={buildApiReference(raw, form)} sessionCookieName={process.env.NODE_ENV === 'production' ? '__Secure-better-auth.session_token' : 'better-auth.session_token'} />;
}
