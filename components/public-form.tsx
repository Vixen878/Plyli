'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { FormPresentation } from './form-presentation';
import { apiRequest, HttpError } from '@/lib/api-client';
import type { FormSchema } from '@/core/types';
import { ShareForm } from './share-form';
import { FormUnavailable } from './form-unavailable';

const receiptSchema = z.object({ data: z.object({ id: z.string(), formRevision: z.number(), submittedAt: z.string(), replayed: z.boolean() }) });
export function PublicForm({ form, slug, rememberOnDevice, submittedMessage, allowRepeat }: {
  form: FormSchema; slug: string; rememberOnDevice: boolean; submittedMessage: string; allowRepeat: boolean;
}) {
  const [sharing, setSharing] = useState(false);
  const [ready, setReady] = useState(!rememberOnDevice);
  const [unavailable, setUnavailable] = useState<{ kind: 'closed' | 'submitted'; message: string }>();
  const receiptKey = `plyli:responded:${form.id}`;

  useEffect(() => {
    if (!rememberOnDevice) return;
    try {
      if (localStorage.getItem(receiptKey)) setUnavailable({ kind: 'submitted', message: submittedMessage });
    } catch { /* Storage can be unavailable in embedded forms. */ }
    setReady(true);
  }, [receiptKey, rememberOnDevice, submittedMessage]);
  // A retry of the same rendered attempt uses the same key and payload; a
  // restarted presentation creates a new engine record and therefore a new key.
  const attempt = useRef<{ fingerprint: string; key: string; body: string } | null>(null);
  if (unavailable) return <FormUnavailable title={form.title} {...unavailable} />;
  if (!ready) return <main className="grid min-h-dvh place-items-center p-5"><p role="status" className="text-sm text-[#6E655E]">Opening form…</p></main>;
  return <>
    {sharing && <ShareForm title={form.title} publicSlug={slug} onClose={() => setSharing(false)} />}
    <FormPresentation form={form} publicMode allowRepeat={allowRepeat} onShare={() => setSharing(true)} storageLabel="Powered by Plyli · Your response is saved when you submit."
    onClosePreview={() => window.location.reload()} onInspectResponses={() => {}}
    onSaveResponse={async (record) => {
      const fingerprint = JSON.stringify({ revision: form.revision, answers: record.answers, sessionId: record.sessionId });
      if (attempt.current?.fingerprint !== fingerprint) {
        const body = JSON.stringify({ revision: form.revision, answers: record.answers, durationSeconds: record.durationSeconds, attribution: record.attribution, viewport: record.viewport, sessionId: record.sessionId });
        attempt.current = { fingerprint, key: crypto.randomUUID(), body };
      }
      const pending = attempt.current;
      if (!pending) throw new Error('Unable to prepare submission.');
      try {
        await apiRequest(`public/forms/${slug}/submissions`, receiptSchema, { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: pending.body });
      } catch (error) {
        if (error instanceof HttpError && (error.code === 'FORM_CLOSED' || error.code === 'ALREADY_SUBMITTED')) {
          setUnavailable({ kind: error.code === 'FORM_CLOSED' ? 'closed' : 'submitted', message: error.message });
        }
        throw error;
      }
      if (rememberOnDevice) {
        try { localStorage.setItem(receiptKey, '1'); } catch { /* A saved response still succeeds without local storage. */ }
      }
      attempt.current = null;
    }} />
  </>;
}
