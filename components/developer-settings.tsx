'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, X, ArrowUpRight, Download, Upload } from 'lucide-react';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { keyInfoSchema, scopeSchema, integrationPolicySchema, retentionSettingsSchema, type ApiScope, type FormDocument, type IntegrationPolicy } from '@/core/contracts';
import { PaperButton } from './paper-primitives';
import { JsonImportDialog, type JsonImportResult } from './json-import-dialog';

const keyPage = z.object({ data: z.array(keyInfoSchema), nextCursor: z.string().nullable() });
const createdKey = z.object({ data: z.object({ id: z.string(), secret: z.string(), prefix: z.string(), scopes: z.array(scopeSchema), expiresAt: z.string().nullable() }) });
const policyEnvelope = z.object({ data: z.object({ version: z.number(), policy: integrationPolicySchema }) });
const retentionEnvelope = z.object({ data: retentionSettingsSchema });
export const inputClass = 'paper-field w-full px-3 py-2.5 rounded-xl border-2 border-[#2A2623] bg-[#FAF6F0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4573B] text-sm';
const panelClass = 'bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 sm:p-7 space-y-5 shadow-[3px_3px_0px_#2A2623]';

export function DeveloperSettings({ workspaceId, forms }: { workspaceId: string; forms: FormDocument[] }) {
  const [keys, setKeys] = useState<z.infer<typeof keyInfoSchema>[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [name, setName] = useState(''); const [days, setDays] = useState('30');
  const [scopes, setScopes] = useState<ApiScope[]>(['forms:read', 'submissions:write']);
  const [formIds, setFormIds] = useState<string[]>([]); const [workspaceWide, setWorkspaceWide] = useState(false);
  const [secret, setSecret] = useState(''); const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false); const [revoking, setRevoking] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const base = `workspaces/${workspaceId}/keys`;
  useEffect(() => {
    if (!creating) return;
    dialog.current?.showModal();
    nameInput.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [creating]);
  useEffect(() => { let live = true; apiRequest(base, keyPage).then((page) => { if (live) { setKeys(page.data); setCursor(page.nextCursor); } }).catch((error: unknown) => { if (live) setStatus(error instanceof Error ? error.message : 'Unable to load credentials.'); }); return () => { live = false; }; }, [base]);
  async function refresh() { const page = await apiRequest(base, keyPage); setKeys(page.data); setCursor(page.nextCursor); }
  async function run(work: () => Promise<void>) { setBusy(true); setStatus(''); try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Request failed.'); } finally { setBusy(false); } }
  return <div className="paper-control max-w-5xl mx-auto p-5 sm:p-8 space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-5">
      <div><p className="text-xs text-[#6E655E] mb-2">DEVELOPER ACCESS</p><h1 className="font-display font-bold text-3xl">Connect your applications</h1><p className="mt-3 text-[#6E655E] text-sm">Create a credential for your application’s backend.</p></div>
      <PaperButton variant="coral" disabled={busy} onClick={() => { setStatus(''); setCreating(true); }}><Plus size={16} />Create API Key</PaperButton>
    </div>
    <dialog ref={dialog} aria-labelledby="create-key-title" aria-describedby="create-key-description" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { setCreating(false); setSecret(''); setStatus(''); }} className="paper-control m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-5 sm:p-7 text-[#2A2623] shadow-[5px_5px_0px_#2A2623] backdrop:bg-[#2A2623]/35">
      <div className="flex items-start justify-between gap-4 mb-6"><div><h2 id="create-key-title" className="font-display font-bold text-xl">{secret ? 'Your API key is ready' : 'Create API key'}</h2><p id="create-key-description" className="text-sm text-[#6E655E] mt-2">{secret ? 'Copy it now. You won’t be able to see it again.' : 'Choose the permissions and forms your application needs.'}</p></div><PaperButton type="button" size="sm" variant="ghost" aria-label="Close dialog" disabled={busy} onClick={() => dialog.current?.close()}><X size={18} /></PaperButton></div>
      {!secret && <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
        const result = await apiRequest(base, createdKey, { method: 'POST', body: JSON.stringify({ name, scopes, formIds: workspaceWide ? null : formIds, expiresAt: new Date(Date.now() + Number(days) * 86400000).toISOString() }) });
        setSecret(result.data.secret); setName(''); await refresh();
      }); }} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-semibold space-y-2 block">Application name<input ref={nameInput} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Event registration backend" /></label><label className="text-sm font-semibold space-y-2 block">Expires in<select className={inputClass} value={days} onChange={(e) => setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label></div>
        <fieldset><legend className="text-sm font-semibold mb-3">Permissions</legend><div className="grid sm:grid-cols-2 gap-3">{scopeSchema.options.map((scope) => <label key={scope} className="text-sm flex items-center gap-2"><input type="checkbox" checked={scopes.includes(scope)} onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope))} /><code>{scope}</code></label>)}</div></fieldset>
        <fieldset className="border-t border-[#2A2623]/15 pt-4"><legend className="text-sm font-semibold">Form access</legend><label className="flex gap-2 items-center text-sm my-3"><input type="checkbox" checked={workspaceWide} onChange={(e) => setWorkspaceWide(e.target.checked)} />All current and future forms in this workspace</label>
          {!workspaceWide && <div className="max-h-44 overflow-y-auto space-y-2">{forms.length ? forms.map((form) => <label key={form.definition.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={formIds.includes(form.definition.id)} onChange={(e) => setFormIds((prev) => e.target.checked ? [...prev, form.definition.id] : prev.filter((id) => id !== form.definition.id))} />{form.definition.title}</label>) : <p className="text-sm text-[#6E655E]">Create a form first, or explicitly choose workspace-wide access.</p>}</div>}
        </fieldset><div className="flex justify-end gap-3 border-t border-[#2A2623]/15 pt-5"><PaperButton type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</PaperButton><PaperButton type="submit" variant="coral" disabled={busy || !scopes.length || (!workspaceWide && !formIds.length)}>{busy ? 'Creating…' : 'Create key'}</PaperButton></div>
      </form>}
      {secret && <div className="space-y-4"><input aria-label="New API key" readOnly className={`${inputClass} font-mono`} value={secret} /><p className="text-xs text-[#6E655E]">Keep this key private. Use it only on your application’s server.</p><div className="flex justify-end gap-3"><PaperButton onClick={() => { void navigator.clipboard.writeText(secret).then(() => setStatus('Key copied.')).catch(() => setStatus('Select the key above to copy it.')); }}>Copy key</PaperButton><PaperButton variant="coral" onClick={() => dialog.current?.close()}>Done</PaperButton></div></div>}
      {creating && status && <p role="status" className="mt-4 text-sm p-3 bg-[#F6D97A]/30 rounded-xl">{status}</p>}
    </dialog>
    <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Your API keys</h2><a className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:text-[#D4573B] focus-visible:outline-2" href="/api-reference" target="_blank" rel="noreferrer">API reference<ArrowUpRight size={13} /></a></div>{!keys.length && <p className="text-sm text-[#6E655E]">No credentials yet.</p>}
      <div className="divide-y divide-[#2A2623]/15">{keys.map((key) => <article key={key.id} className="py-4 flex flex-wrap items-start justify-between gap-4"><div className="space-y-1 min-w-0"><h3 className="font-semibold">{key.name} <span className="text-xs font-normal text-[#6E655E]">{key.revokedAt ? 'Revoked' : key.expiresAt && new Date(key.expiresAt) <= new Date() ? 'Expired' : 'Active'}</span></h3><p className="font-mono text-xs">{key.prefix}••••••</p><p className="text-xs text-[#6E655E]">{key.scopes.join(' · ')}</p><p className="text-xs text-[#6E655E]">{key.formIds ? `${key.formIds.length} selected ${key.formIds.length === 1 ? 'form' : 'forms'}` : 'Workspace-wide'} · Last used {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'never'} · Expires {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'never'}</p></div>{!key.revokedAt && (revoking === key.id ? <div className="flex gap-2"><PaperButton size="sm" disabled={busy} variant="coral" onClick={() => void run(async () => { await apiRequest(`${base}/${key.id}`, z.object({ data: z.object({ revoked: z.boolean() }) }), { method: 'DELETE' }); setRevoking(null); await refresh(); })}>Confirm revoke</PaperButton><PaperButton size="sm" variant="ghost" onClick={() => setRevoking(null)}>Cancel</PaperButton></div> : <PaperButton size="sm" variant="ghost" onClick={() => setRevoking(key.id)}>Revoke</PaperButton>)}</article>)}</div>
      {cursor && <PaperButton size="sm" disabled={busy} onClick={() => void run(async () => { const page = await apiRequest(`${base}?cursor=${cursor}`, keyPage); setKeys((prev) => [...prev, ...page.data]); setCursor(page.nextCursor); })}>Load more</PaperButton>}
    </section>
    {!creating && status && <p role="status" className="text-sm p-3 bg-[#F6D97A]/30 rounded-xl">{status}</p>}
  </div>;
}

export function IntegrationSettings({ workspaceId, formId, publicUrl, disabled, onUnpublish, onSaved }: {
  workspaceId: string;
  formId: string;
  publicUrl?: string;
  disabled: boolean;
  onUnpublish: () => void;
  onSaved: (version: number) => void;
}) {
  const [savedMode, setSavedMode] = useState<'public' | 'private' | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [policy, setPolicy] = useState<IntegrationPolicy | null>(null); const [version, setVersion] = useState(0);
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const path = `workspaces/${workspaceId}/forms/${formId}/integration`;
  useEffect(() => { let live = true; apiRequest(path, policyEnvelope).then((r) => { if (live) { setPolicy(r.data.policy); setSavedMode(r.data.policy.mode); setVersion(r.data.version); } }).catch((error: unknown) => { if (live) setStatus(error instanceof Error ? error.message : 'Unable to load settings.'); }); return () => { live = false; }; }, [path]);
  return <div className="paper-control max-w-4xl mx-auto p-5 sm:p-8 space-y-6">
    <h1 className="font-display font-bold text-2xl">Integration settings</h1>
    {publicUrl && <section aria-labelledby="publication-heading" className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div>
          <h2 id="publication-heading" className="font-display font-bold">Published form</h2>
          {savedMode && <p className="mt-1 text-sm text-[#6E655E]">{savedMode === 'public' ? 'Available through the published link.' : 'Available to authorized integrations.'}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {savedMode === 'public' && <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2623]/35 px-3 py-2 text-xs font-semibold hover:bg-[#FAF6F0] focus-visible:outline-2">
            Open published form <ArrowUpRight size={14} aria-hidden="true" />
          </a>}
          {!confirmUnpublish && <PaperButton variant="ghost" size="sm" disabled={disabled || busy} onClick={() => setConfirmUnpublish(true)}>Unpublish</PaperButton>}
        </div>
      </div>
      {confirmUnpublish && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2A2623]/20 bg-[#FAF6F0] p-3">
        <p className="text-sm">Unpublish this form? Existing responses will stay available.</p>
        <div className="flex flex-wrap gap-2">
          <PaperButton variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirmUnpublish(false)}>Cancel</PaperButton>
          <PaperButton variant="coral" size="sm" disabled={disabled || busy} onClick={onUnpublish}>Unpublish form</PaperButton>
        </div>
      </div>}
    </section>}
    {policy && <section className={panelClass}><fieldset disabled={disabled || busy} className="min-w-0 space-y-4">
    <fieldset className="space-y-3"><legend className="font-semibold mb-3">Who can access this form?</legend><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="radio" name="form-access" checked={policy.mode === 'public'} onChange={() => setPolicy({ ...policy, mode: 'public' })} /><span><strong>Public form</strong><span className="block text-[#6E655E] mt-1">Anyone with the published link can read the definition and submit.</span></span></label><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="radio" name="form-access" checked={policy.mode === 'private'} onChange={() => setPolicy({ ...policy, mode: 'private' })} /><span><strong>Private integration</strong><span className="block text-[#6E655E] mt-1">Your backend uses a form-bound API key. Anonymous URLs and public submissions are disabled immediately.</span></span></label></fieldset>
    <div className="border-t border-[#2A2623]/15 pt-5 space-y-4"><h2 className="font-semibold">Allowed contextual metadata</h2><p className="text-sm text-[#6E655E]">Define fields such as eventId or registrationId. Unknown keys and wrong value types are rejected. Required fields need a private integration. Metadata never grants access to a user or workspace.</p>
      {policy.contextFields.map((field, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_110px_auto_auto] gap-3 items-center"><input aria-label={`Context key ${index + 1}`} className={inputClass} placeholder="eventId" value={field.key} onChange={(e) => setPolicy({ ...policy, contextFields: policy.contextFields.map((f, i) => i === index ? { ...f, key: e.target.value } : f) })} /><select aria-label={`Context type ${index + 1}`} className={inputClass} value={field.type} onChange={(e) => { const type = z.enum(['string', 'number', 'boolean']).parse(e.target.value); setPolicy({ ...policy, contextFields: policy.contextFields.map((f, i) => i === index ? { ...f, type } : f) }); }}><option>string</option><option>number</option><option>boolean</option></select><label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={field.required} onChange={(e) => setPolicy({ ...policy, contextFields: policy.contextFields.map((f, i) => i === index ? { ...f, required: e.target.checked } : f) })} />Required</label><button className="text-xs underline" onClick={() => setPolicy({ ...policy, contextFields: policy.contextFields.filter((_, i) => i !== index) })}>Remove</button></div>)}
      <PaperButton size="sm" disabled={policy.contextFields.length >= 20} onClick={() => setPolicy({ ...policy, contextFields: [...policy.contextFields, { key: '', type: 'string', required: false }] })}>Add context field</PaperButton>
      {policy.mode === 'public' && <label className="text-sm flex gap-2 items-start"><input type="checkbox" checked={policy.allowPublicContext} onChange={(e) => setPolicy({ ...policy, allowPublicContext: e.target.checked })} />Allow respondents to supply these fields. Public metadata is unverified and must not be used as identity.</label>}
    </div><PaperButton variant="coral" disabled={disabled || busy} onClick={async () => { setBusy(true); try { const r = await apiRequest(path, policyEnvelope, { method: 'PUT', body: JSON.stringify({ expectedVersion: version, policy }) }); setVersion(r.data.version); setSavedMode(r.data.policy.mode); onSaved(r.data.version); setStatus('Integration policy saved.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); } finally { setBusy(false); } }}>Save integration policy</PaperButton>
    <p className="text-xs text-[#6E655E]">Policy changes apply immediately. Your application retains responsibility for login, authorization, and business operations.</p>
  </fieldset></section>}{status && <p role="status" className="text-sm">{status}</p>}</div>;
}

export function DataSettings({ workspaceId, busy, onExportBackup, onImportBackup }: {
  workspaceId: string;
  busy: boolean;
  onExportBackup: () => void;
  onImportBackup: (raw: string) => Promise<JsonImportResult>;
}) {
  const [settings, setSettings] = useState<z.infer<typeof retentionSettingsSchema> | null>(null); const [status, setStatus] = useState(''); const [confirm, setConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const path = `workspaces/${workspaceId}/retention`;
  useEffect(() => { let live = true; apiRequest(path, retentionEnvelope).then((r) => { if (live) setSettings(r.data); }).catch((error: unknown) => { if (live) setStatus(error instanceof Error ? error.message : 'Unable to load retention.'); }); return () => { live = false; }; }, [path]);
  return <div className="paper-control max-w-3xl mx-auto p-5 sm:p-8 space-y-6"><h1 className="font-display text-3xl font-bold">Data settings</h1>{settings && <section className={panelClass}><h2 className="font-display text-lg font-bold">Response retention</h2><p className="text-sm text-[#6E655E]">Responses older than this window move to trash during scheduled maintenance. After the recovery window, their answers and contextual metadata are permanently erased. Your form history stays available. Deleted answers cannot be recovered after this window.</p><label className="text-sm block space-y-2 font-semibold">Keep active responses<select className={inputClass} value={settings.responseRetentionDays ?? 'forever'} onChange={(e) => { setConfirm(false); setSettings({ ...settings, responseRetentionDays: e.target.value === 'forever' ? null : Number(e.target.value) }); }}><option value="forever">Until I delete them</option>{[7, 30, 90, 180, 365].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}</select></label><label className="text-sm block space-y-2 font-semibold">Trash recovery window<select className={inputClass} value={settings.trashRetentionDays} onChange={(e) => { setConfirm(false); setSettings({ ...settings, trashRetentionDays: Number(e.target.value) }); }}>{[1, 7, 14, 30].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}</select></label>
      {confirm ? <div className="p-4 rounded-xl border border-[#D4573B] space-y-3"><p className="text-sm">This applies to existing responses too. Expired responses will be erased after their recovery window.</p><div className="flex gap-2"><PaperButton size="sm" variant="coral" onClick={async () => { try { await apiRequest(path, retentionEnvelope, { method: 'PUT', body: JSON.stringify(settings) }); setStatus('Retention policy saved.'); setConfirm(false); } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); } }}>Confirm retention policy</PaperButton><PaperButton size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</PaperButton></div></div> : <PaperButton onClick={() => setConfirm(true)}>Save retention policy</PaperButton>}
    </section>}
    <section className={panelClass} aria-labelledby="workspace-backups-title">
      <div>
        <h2 id="workspace-backups-title" className="font-display text-lg font-bold">Workspace backups</h2>
        <p className="mt-1 text-sm text-[#6E655E]">Download your active forms and response history, or import them from a Plyli backup.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PaperButton size="sm" disabled={busy} onClick={onExportBackup}><Download size={14} />Export backup</PaperButton>
        <PaperButton size="sm" variant="ghost" disabled={busy} onClick={() => setImportOpen(true)}><Upload size={14} />Import backup</PaperButton>
      </div>
      <p className="text-xs text-[#6E655E]">Backups can contain respondents’ answers. Keep downloaded files private.</p>
    </section>
    {importOpen && <JsonImportDialog kind="backup" onClose={() => setImportOpen(false)} onImport={onImportBackup} />}
    {status && <p role="status">{status}</p>}
  </div>;
}
