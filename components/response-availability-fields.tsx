'use client';

import { useState } from 'react';
import { defaultClosedMessage, defaultSubmittedMessage, type SharingSettings } from '@/lib/form-sharing';
import { PaperButton } from './paper-primitives';

type Availability = Pick<SharingSettings, 'responsesClosed' | 'responsesEndAt' | 'closedMessage' | 'submittedMessage'>;

function localDateTime(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ResponseAvailabilityFields({ settings, working, field, onSave }: {
  settings: Availability; working: boolean; field: string; onSave: (value: Partial<Availability>) => void;
}) {
  const [closed, setClosed] = useState(settings.responsesClosed);
  const [end, setEnd] = useState(() => localDateTime(settings.responsesEndAt));
  const [closedMessage, setClosedMessage] = useState(settings.closedMessage ?? '');
  const [submittedMessage, setSubmittedMessage] = useState(settings.submittedMessage ?? '');
  const changed = closed !== settings.responsesClosed || end !== localDateTime(settings.responsesEndAt)
    || (closedMessage.trim() || null) !== settings.closedMessage || (submittedMessage.trim() || null) !== settings.submittedMessage;
  return <form className="paper-control mt-3 space-y-4" onSubmit={(event) => {
    event.preventDefault();
    if (!changed) return;
    onSave({
      responsesClosed: closed,
      ...(end !== localDateTime(settings.responsesEndAt) ? { responsesEndAt: end ? new Date(end).toISOString() : null } : {}),
      closedMessage: closedMessage.trim() || null,
      submittedMessage: submittedMessage.trim() || null,
    });
  }}>
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={closed} onChange={(event) => setClosed(event.target.checked)} />
      Close responses manually
    </label>
    <label className="block space-y-1 text-sm font-semibold">
      <span>Close automatically <span className="font-normal text-[#6E655E]">(optional)</span></span>
      <input type="datetime-local" className={field} min="2000-01-01T00:00" max="9999-12-31T23:59" value={end} onChange={(event) => setEnd(event.target.value)} />
      <span className="block text-xs font-normal text-[#6E655E]">Uses your local time zone. Clear the date and time to remove the deadline.</span>
    </label>
    <label className="block space-y-1 text-sm font-semibold">
      <span>Message when responses are closed</span>
      <textarea className={field} rows={2} maxLength={500} value={closedMessage} placeholder={defaultClosedMessage} onChange={(event) => setClosedMessage(event.target.value)} />
    </label>
    <label className="block space-y-1 text-sm font-semibold">
      <span>Message for returning respondents</span>
      <textarea className={field} rows={2} maxLength={500} value={submittedMessage} placeholder={defaultSubmittedMessage} onChange={(event) => setSubmittedMessage(event.target.value)} />
    </label>
    <p className="text-xs text-[#6E655E]">Leave a message blank to use Plyli’s default.</p>
    <PaperButton variant="yellow" size="sm" type="submit" disabled={working || !changed}>Save response availability</PaperButton>
  </form>;
}
