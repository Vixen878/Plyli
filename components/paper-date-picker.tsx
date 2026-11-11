'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { isValidCalendarDateString } from '@/core/validation';
import { PaperButton } from './paper-primitives';

const displayDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

function toIsoDate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function PaperDatePicker({ label, value, onChange, className, style }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const heading = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [typedDate, setTypedDate] = useState('');
  const [error, setError] = useState('');
  const selected = isValidCalendarDateString(value) ? new Date(value + 'T12:00:00') : undefined;
  const display = selected ? displayDate.format(selected) : 'Choose a date';

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  function choose(next: string) {
    onChange(next);
    dialog.current?.close();
  }

  function submitTypedDate() {
    const next = typedDate.trim();
    if (!isValidCalendarDateString(next)) {
      setError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    choose(next);
  }

  return <div onKeyDown={(event) => { if (event.key === 'Enter') event.stopPropagation(); }}>
    <button
      type="button"
      aria-label={label + ': ' + display}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={'flex w-full cursor-pointer items-center justify-between gap-3 text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ' + (className ?? '')}
      style={style}
      onClick={() => { setTypedDate(value); setError(''); setOpen(true); }}
    >
      <span>{display}</span><CalendarDays size={18} aria-hidden="true" />
    </button>
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      aria-labelledby={heading}
      className="paper-calendar m-auto max-h-[calc(100dvh-1rem)] w-max max-w-[calc(100vw-1.5rem)] overflow-auto rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-3.5 text-[#2A2623] shadow-[4px_4px_0_#2A2623] backdrop:bg-[#2A2623]/40 sm:p-4"
    >
      {open && <>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id={heading} className="font-display text-lg font-bold">Choose a date</h2>
          <PaperButton type="button" size="sm" variant="ghost" aria-label="Close calendar" onClick={() => dialog.current?.close()}><X size={16} /></PaperButton>
        </div>
        <DayPicker
          mode="single"
          required
          navLayout="after"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => { if (date) choose(toIsoDate(date)); }}
        />
        <div className="mt-2 border-t border-[#2A2623]/20 pt-3">
          <label className="block text-xs font-semibold" htmlFor={heading + '-input'}>Or enter a date</label>
          <div className="mt-1 flex gap-2">
            <input
              id={heading + '-input'}
              type="text"
              value={typedDate}
              onChange={(event) => { setTypedDate(event.target.value); setError(''); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitTypedDate(); } }}
              maxLength={10}
              placeholder="YYYY-MM-DD"
              className="min-w-0 flex-1 rounded-lg border border-[#2A2623]/40 bg-[#FAF6F0] px-2 py-1.5 font-mono text-sm"
            />
            <PaperButton type="button" variant="yellow" size="sm" onClick={submitTypedDate}>Use date</PaperButton>
          </div>
          {error && <p className="mt-2 text-xs text-[#A13B26]" role="alert">{error}</p>}
          {value && <button type="button" className="mt-2 text-xs font-semibold underline underline-offset-4" onClick={() => choose('')}>Clear date</button>}
        </div>
      </>}
    </dialog>
  </div>;
}
