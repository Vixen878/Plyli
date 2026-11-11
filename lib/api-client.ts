'use client';
import { z } from 'zod';
import { errorEnvelopeSchema } from '@/core/contracts';

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export async function apiRequest<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path.startsWith('/api/studio/') ? path : `/api/v1/${path}`, {
    ...init, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new HttpError(response.status, 'INVALID_RESPONSE', 'Plyli could not complete this request. Please try again.'); }
  if (!response.ok) {
    const error = errorEnvelopeSchema.safeParse(payload);
    let message = error.success ? error.data.error.message : 'Request failed.';
    if (error.success) {
      const issues = z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })).safeParse(error.data.error.details);
      if (issues.success) message += ' ' + issues.data.slice(0, 3).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    }
    throw new HttpError(response.status, error.success ? error.data.error.code : 'REQUEST_FAILED', message);
  }
  const result = schema.safeParse(payload);
  if (!result.success) throw new HttpError(response.status, 'INVALID_RESPONSE', 'Plyli could not complete this request. Please refresh and try again.');
  return result.data;
}
