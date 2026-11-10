'use client';
import { useRef } from 'react';
import { z } from 'zod';
import { FormPresentation } from './form-presentation';
import { apiRequest } from '@/lib/api-client';
import type { FormSchema } from '@/core/types';

const receiptSchema = z.object({ data: z.object({ id: z.string(), formRevision: z.number(), submittedAt: z.string(), replayed: z.boolean() }) });
export function PublicForm({ form, slug }: { form: FormSchema; slug: string }) {
  // A retry of the same rendered attempt uses the same key and payload; a
  // restarted presentation creates a new engine record and therefore a new key.
  const attempt = useRef<{ fingerprint: string; key: string; body: string } | null>(null);
  return <FormPresentation form={form} publicMode storageLabel="Powered by Plyli · Your response is saved when you submit."
    onClosePreview={() => window.location.reload()} onInspectResponses={() => {}}
    onSaveResponse={async (record) => {
      const fingerprint = JSON.stringify({ revision: form.revision, answers: record.answers, sessionId: record.sessionId });
      if (attempt.current?.fingerprint !== fingerprint) {
        const body = JSON.stringify({ revision: form.revision, answers: record.answers, durationSeconds: record.durationSeconds, attribution: record.attribution, viewport: record.viewport, sessionId: record.sessionId });
        attempt.current = { fingerprint, key: crypto.randomUUID(), body };
      }
      const pending = attempt.current;
      if (!pending) throw new Error('Unable to prepare submission.');
      await apiRequest(`public/forms/${slug}/submissions`, receiptSchema, { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: pending.body });
      attempt.current = null;
    }} />;
}
