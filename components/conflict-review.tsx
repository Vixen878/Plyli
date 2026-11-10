'use client';
import { useState } from 'react';
import type { FormDocument } from '@/core/contracts';
import type { FormSchema } from '@/core/types';
import { mergeFormChanges } from '@/core/conflicts';
import { PaperButton } from './paper-primitives';

export function ConflictReview({ base, local, latest, onResolve, onDownload }: { base: FormSchema; local: FormSchema; latest: FormDocument; onResolve: (definition: FormSchema) => void; onDownload: () => void }) {
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({});
  const result = mergeFormChanges(base, local, latest.definition, choices);
  return <section aria-label="Resolve save conflict" className="paper-control max-w-5xl m-5 mx-auto border-2 border-[#D4573B] bg-[#FFFDF9] rounded-2xl p-5 space-y-4">
    <h2 className="font-display font-bold text-xl">This form changed in another session</h2>
    <p className="text-sm text-[#6E655E]">Your unsaved work is still here. Changes to different fields are combined automatically. Choose which version to keep for each conflicting field, then review and save the merged draft.</p>
    {result.conflicts.map((conflict) => <fieldset key={conflict.field} className="border-t border-[#2A2623]/20 pt-4"><legend className="font-semibold text-sm">{conflict.field}</legend><div className="grid sm:grid-cols-2 gap-4">{(['local', 'remote'] as const).map((side) => <label key={side} className="block border border-[#2A2623]/20 p-3 rounded-xl text-sm"><span className="flex gap-2 items-center"><input type="radio" name={`conflict-${conflict.field}`} checked={choices[conflict.field] === side} onChange={() => setChoices({ ...choices, [conflict.field]: side })} />{side === 'local' ? 'My draft' : 'Latest saved version'}</span><pre className="mt-3 text-xs whitespace-pre-wrap overflow-auto max-h-40">{JSON.stringify(conflict[side], null, 2)}</pre></label>)}</div></fieldset>)}
    {!result.conflicts.length && <p className="text-sm">Your edits and the latest saved changes do not overlap.</p>}
    <div className="flex flex-wrap gap-2"><PaperButton variant="coral" disabled={result.conflicts.some((c) => !choices[c.field])} onClick={() => onResolve(result.merged)}>Use merged draft</PaperButton><PaperButton onClick={onDownload}>Download my draft</PaperButton><PaperButton variant="ghost" onClick={() => onResolve(latest.definition)}>Use latest saved version</PaperButton></div>
  </section>;
}
