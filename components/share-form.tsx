'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { z } from 'zod';
import { Copy, ExternalLink, Info, Link2, QrCode, X } from 'lucide-react';
import { buildCampaignUrl } from '@/core/attribution';
import { apiRequest } from '@/lib/api-client';
import { sharingSchema, sharingUpdateSchema, suggestShareSlug, type SharingSettings } from '@/lib/form-sharing';
import { PaperButton } from './paper-primitives';
import { campaignFields } from '@/lib/campaign-fields';
import { ResponseAvailabilityFields } from './response-availability-fields';

const sharingEnvelope = z.object({ data: sharingSchema });
const field = 'w-full rounded-lg border border-[#2A2623]/40 bg-[#FAF6F0] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[#D4573B]';

export function ShareForm({ title, path, publicSlug, onClose, onEditor, onIntegration }: {
  title: string;
  path?: string;
  publicSlug?: string;
  onClose: () => void;
  onEditor?: () => void;
  onIntegration?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<SharingSettings | null>(null);
  const [slug, setSlug] = useState(() => suggestShareSlug(title));
  const [campaign, setCampaign] = useState({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [qr, setQr] = useState<{ link: string; png: string } | null>(null);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void apiRequest(path, sharingEnvelope, { signal: controller.signal }).then(({ data }) => {
      setSettings(data);
      if (data.customSlug) setSlug(data.customSlug);
    }).catch(() => { if (!controller.signal.aborted) setError('Could not load sharing settings. Close and try again.'); });
    return () => controller.abort();
  }, [path]);

  const availableSlug = settings?.published && settings.publicAccess ? settings.slug : publicSlug;
  const link = availableSlug ? new URL(`/f/${encodeURIComponent(availableSlug)}`, window.location.origin).href : '';
  const campaignLink = link ? buildCampaignUrl({ baseUrl: link, ...campaign }) : null;
  const embed = link ? `<iframe src="${link}" title="Plyli form" width="100%" height="720" loading="lazy"></iframe>` : '';

  async function update(input: z.input<typeof sharingUpdateSchema>) {
    if (!path || working) return;
    const result = sharingUpdateSchema.safeParse(input);
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setError(''); setStatus(''); setWorking(true);
    try {
      const { data } = await apiRequest(path, sharingEnvelope, { method: 'PUT', body: JSON.stringify(result.data) });
      setSettings(data);
      if (data.customSlug) setSlug(data.customSlug);
      setStatus('Sharing settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save sharing settings.');
    } finally { setWorking(false); }
  }

  async function copy(text: string, label: string) {
    setError('');
    try { await navigator.clipboard.writeText(text); setStatus(label); }
    catch { setError('Clipboard access is unavailable. Select and copy the text directly.'); }
  }

  async function showQr() {
    setError('');
    try {
      const { toDataURL } = await import('qrcode');
      const png = await toDataURL(link, { width: 640, margin: 4 });
      setQr({ link, png });
    } catch { setError('Could not create a QR code. Try again.'); }
  }

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="share-form-title" className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[85dvh] overflow-y-auto rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-5 text-[#2A2623] shadow-[5px_5px_0px_#2A2623] backdrop:bg-[#2A2623]/40 sm:p-7">
    <div className="flex items-start justify-between gap-4">
      <div><h2 id="share-form-title" className="font-display text-2xl font-bold">Share form</h2><p className="mt-1 break-words text-sm text-[#6E655E]">{title}</p></div>
      <PaperButton variant="ghost" size="sm" aria-label="Close sharing" onClick={() => dialog.current?.close()}><X size={17} /></PaperButton>
    </div>
    <div className="mt-5 space-y-4">
      {link ? <>
        <label className="block space-y-1 text-sm font-semibold">Published link<input className={field} readOnly value={link} onFocus={(event) => event.target.select()} /></label>
        <div className="flex flex-wrap items-center gap-2">
          <PaperButton size="sm" variant="yellow" onClick={() => void copy(link, 'Link copied.')}><Copy size={14} />Copy link</PaperButton>
          <a className="inline-flex items-center gap-1.5 px-2 py-2 text-sm underline underline-offset-4" href={link} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open form</a>
          <PaperButton size="sm" onClick={() => void showQr()}><QrCode size={14} />QR code</PaperButton>
        </div>
        {qr?.link === link && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#2A2623]/20 p-2">
          <Image src={qr.png} unoptimized width={112} height={112} alt="QR code for the published form" />
          <a className="text-sm font-bold underline underline-offset-4" href={qr.png} download={`plyli-${availableSlug}-qr.png`}>Download QR code</a>
        </div>}
        <details className="border-t border-[#2A2623]/15 pt-3">
          <summary className="cursor-pointer text-sm font-bold">Embed on a website</summary>
          <textarea className={`${field} mt-2 font-mono`} aria-label="Embed code" readOnly value={embed} onFocus={(event) => event.target.select()} rows={3} />
          <PaperButton size="sm" onClick={() => void copy(embed, 'Embed code copied.')}>Copy embed code</PaperButton>
        </details>
        {path && <details className="border-t border-[#2A2623]/15 pt-3">
          <summary className="cursor-pointer text-sm font-bold">Create a campaign link</summary>
          <details className="mt-3 rounded-lg bg-[#FAF6F0] px-3 py-2">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold"><Info size={15} aria-hidden="true" />What do these fields mean?</summary>
            <dl className="mt-2 space-y-1.5 text-xs text-[#6E655E]">{campaignFields.map(({ key, label, help }) => <div key={key}><dt className="inline font-bold text-[#2A2623]">{label}. </dt><dd className="inline">{help}</dd></div>)}</dl>
          </details>
          <div className="my-3 grid gap-2 min-[400px]:grid-cols-2">
            {campaignFields.map(({ key, label, example }) => <label className="space-y-1 text-xs font-semibold" key={key}><span>{label}</span><input className={field} maxLength={120} placeholder={example} value={campaign[key]} onChange={(event) => setCampaign({ ...campaign, [key]: event.target.value })} /></label>)}
          </div>
          <input className={field} aria-label="Campaign link" readOnly value={campaignLink?.url ?? ''} onFocus={(event) => event.target.select()} />
          <PaperButton size="sm" className="mt-2" disabled={!campaignLink?.valid} onClick={() => void copy(campaignLink!.url, 'Campaign link copied.')}><Link2 size={14} />Copy campaign link</PaperButton>
        </details>}
      </> : settings ? <div className="rounded-xl bg-[#FDF7E2] p-3 text-sm">
        <p>{!settings.published ? 'Publish this form to make its link available.' : 'This form is private. Manage access in Integration.'}</p>
        <PaperButton className="mt-2" size="sm" onClick={settings.published ? onIntegration : onEditor}>{settings.published ? 'Open Integration' : 'Open editor to publish'}</PaperButton>
      </div> : !error && <p role="status" className="text-sm">Loading sharing settings…</p>}
      {settings && <details className="border-t border-[#2A2623]/15 pt-3">
        <summary className="cursor-pointer text-sm font-bold">Link and response settings</summary>
        <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void update({ slug }); }}>
          <label className="block text-sm font-semibold">Custom link slug<input className={field} maxLength={64} value={slug} onChange={(event) => setSlug(event.target.value)} /></label>
          <p className="text-xs text-[#6E655E]">Previous links keep working after you change the slug.</p>
          <PaperButton size="sm" type="submit" disabled={working || slug === settings.customSlug}>Save link</PaperButton>
        </form>
        <label className="mt-4 block text-sm font-semibold">Responses per respondent
          <select className={field} value={settings.submissionPolicy} disabled={working} onChange={(event) => void update({ submissionPolicy: sharingSchema.shape.submissionPolicy.parse(event.target.value) })}>
            <option value="one">One per identified respondent</option>
            <option value="verified">Require identity and allow one</option>
            <option value="multiple">Allow multiple responses</option>
          </select>
        </label>
        <p className="mt-1 text-xs text-[#6E655E]">Without sign-in, Plyli can remember a response on the same browser. Require identity to enforce one response per account.</p>
      </details>}
      {settings && <details className="border-t border-[#2A2623]/15 pt-3">
        <summary className="cursor-pointer text-sm font-bold">Response availability</summary>
        <ResponseAvailabilityFields settings={settings} working={working} field={field} onSave={(values) => void update(values)} />
      </details>}
      {onIntegration && <PaperButton size="sm" variant="ghost" onClick={onIntegration}>Integration settings</PaperButton>}
      {status && <p role="status" className="text-sm">{status}</p>}
      {error && <p role="alert" className="rounded-lg bg-[#FDECE8] p-2 text-sm">{error}</p>}
    </div>
  </dialog>;
}
