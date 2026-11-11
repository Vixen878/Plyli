'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PaperButton } from './paper-primitives';

export type JsonImportResult = { valid: boolean; error?: string };

export function JsonImportDialog({ kind, onClose, onImport, getExample }: {
  kind: 'form' | 'backup';
  onClose: () => void;
  onImport: (text: string) => JsonImportResult | Promise<JsonImportResult>;
  getExample?: () => string;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const locked = useRef(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const creating = kind === 'form';

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function processInput(operation: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setWorking(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the JSON.');
    } finally {
      locked.current = false;
      setWorking(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(event) => { if (locked.current) event.preventDefault(); }}
      aria-labelledby={id}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-5 text-[#2A2623] shadow-[4px_4px_0_#2A2623] backdrop:bg-[#2A2623]/40 sm:p-7"
    >
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        void processInput(async () => {
          const result = await onImport(text.trim());
          if (!result.valid) throw new Error(result.error ?? 'Check the JSON and try again.');
          dialog.current?.close();
        });
      }}>
        <div>
          <h2 id={id} className="font-display text-xl font-bold">{creating ? 'Paste form JSON' : 'Import backup'}</h2>
          <p className="mt-1 text-sm text-[#6E655E]">{creating
            ? 'Paste a Plyli form definition or choose a JSON file to create a new draft.'
            : 'Choose a Plyli backup file or paste its contents to import forms and response history.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-xl border border-[#2A2623]/50 px-3 py-2 text-xs font-semibold hover:bg-[#FAF6F0] focus-within:outline-2 has-disabled:opacity-50">
            Choose .json file
            <input type="file" className="sr-only" accept=".json,application/json" disabled={working} onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void processInput(async () => { setText(await file.text()); });
            }} />
          </label>
          {getExample && <PaperButton type="button" variant="ghost" size="sm" disabled={working} onClick={() => {
            setText(getExample());
            setError('');
            textarea.current?.focus();
          }}>Load example</PaperButton>}
        </div>
        <label className="block space-y-1 text-sm font-semibold">
          <span>{creating ? 'Form JSON' : 'Backup JSON'}</span>
          <textarea ref={textarea} rows={8} spellCheck={false} value={text} readOnly={working} aria-invalid={Boolean(error)}
            aria-describedby={error ? id + '-error' : undefined}
            onChange={(event) => { setText(event.target.value); setError(''); }}
            className="block w-full resize-y rounded-xl border-2 border-[#2A2623] bg-[#FAF6F0] p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-[#D4573B]" />
        </label>
        {error && <p id={id + '-error'} role="alert" className="whitespace-pre-line break-words rounded-lg bg-[#FDECE8] p-3 text-sm">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <PaperButton type="button" variant="ghost" disabled={working} onClick={() => dialog.current?.close()}>Cancel</PaperButton>
          <PaperButton type="submit" variant="coral" disabled={working || !text.trim()}>
            {working ? 'Working…' : creating ? 'Create draft' : 'Restore backup'}
          </PaperButton>
        </div>
      </form>
    </dialog>
  );
}
