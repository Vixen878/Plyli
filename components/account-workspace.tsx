'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { FormLibrary } from './form-library';
import { FormBuilder, type SelectedBuilderNode } from './form-builder';
import { FlowEditor } from './flow-editor';
import { AppearanceEditor } from './appearance-editor';
import { FormPresentation } from './form-presentation';
import { ResponsesView } from './responses-view';
import { PaperButton } from './paper-primitives';
import { apiRequest, HttpError } from '@/lib/api-client';
import { WorkspaceHeader, type WorkspaceMode } from './workspace-header';
import { DeveloperSettings, IntegrationSettings, RetentionSettings } from './developer-settings';
import { ConflictReview } from './conflict-review';
import { authClient } from '@/lib/auth-client';
import { formDocumentSchema, responseRecordSchema, revisionSnapshotSchema, formDefinitionSchema, analyticsEventSchema, integrationPolicySchema, type FormDocument } from '@/core/contracts';
import type { AnalyticsEvent } from '@/core/analytics';
import { createBlankForm, FORM_TEMPLATES } from '@/lib/form-engine';
import { createRevisionSnapshot } from '@/core/submissions';
import { FormHistoryManager } from '@/core/history';
import type { RecordChangeOptions } from '@/core/history';
import type { FormSchema, FormResponseRecord, FormRevisionSnapshot } from '@/core/types';

const documentEnvelope = z.object({ data: formDocumentSchema });
const formPage = z.object({ data: z.array(formDocumentSchema), nextCursor: z.string().nullable() });
const responsePage = z.object({ data: z.array(responseRecordSchema), nextCursor: z.string().nullable() });
const analyticsPage = z.object({ data: z.array(analyticsEventSchema), nextCursor: z.string().nullable() });
const revisionPage = z.object({ data: z.array(z.object({ revision: z.number(), definition: formDefinitionSchema.nullable(), legacySnapshot: revisionSnapshotSchema.nullable() })), nextCursor: z.number().nullable() });
const acknowledgement = z.object({ data: z.object({ archived: z.boolean() }) });
const trashPage = z.object({ data: z.array(z.object({ record: responseRecordSchema, deletedAt: z.string() })), nextCursor: z.string().nullable() });

function download(name: string, payload: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

export function AccountWorkspace({ userName, workspaceId, initialForms, initialCursor }: { userName: string; workspaceId: string; initialForms: FormDocument[]; initialCursor: string | null }) {
  const [documents, setDocuments] = useState(initialForms);
  const [cursor, setCursor] = useState(initialCursor);
  const [active, setActive] = useState<FormDocument | null>(null);
  const [draft, setDraft] = useState<FormSchema | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>('library');
  const [selected, setSelected] = useState<SelectedBuilderNode>({ kind: 'welcome' });
  const [notice, setNotice] = useState('');
  const [pendingNavigation, setPendingNavigation] = useState<WorkspaceMode | 'signout' | null>(null);
  const [conflict, setConflict] = useState<{ base: FormSchema; local: FormSchema; latest: FormDocument } | null>(null);
  const [archived, setArchived] = useState<FormDocument[]>([]);
  const [archiveCursor, setArchiveCursor] = useState<string | null>(null);
  const [trash, setTrash] = useState<FormResponseRecord[]>([]);
  const [trashCursor, setTrashCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operationLock = useRef(false);
  const [responses, setResponses] = useState<FormResponseRecord[]>([]);
  const [revisions, setRevisions] = useState<FormRevisionSnapshot[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [shareableFormId, setShareableFormId] = useState<string | null>(null);
  const [history] = useState(() => new FormHistoryManager(50, 800));
  const [, setHistoryVersion] = useState(0);
  const [flowQuestion, setFlowQuestion] = useState<string | undefined>();
  const dirty = Boolean(active && draft && JSON.stringify(active.definition) !== JSON.stringify(draft));
  const base = `workspaces/${workspaceId}`;
  async function signOut() { await authClient.signOut(); window.location.assign('/login'); }
  function navigate(next: WorkspaceMode) {
    if (dirty && ['library', 'developers', 'archive', 'data'].includes(next)) { setPendingNavigation(next); return; }
    setMode(next); setNotice('');
    if (['library', 'developers', 'archive', 'data'].includes(next)) { setActive(null); setDraft(null); }
    if (next === 'responses' && active) void run(async () => { await loadResponses(active.definition.id); });
    if (next === 'archive') void run(async () => { const page = await apiRequest(`${base}/forms?archived=true&limit=100`, formPage); setArchived(page.data); setArchiveCursor(page.nextCursor); });
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function run(operation: () => Promise<unknown>) {
    if (operationLock.current) return;
    operationLock.current = true; setBusy(true);
    try { await operation(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to complete the operation.'); }
    finally { operationLock.current = false; setBusy(false); }
  }
  function replace(doc: FormDocument) {
    setDocuments((prev) => [doc, ...prev.filter((d) => d.definition.id !== doc.definition.id)]);
    setActive(doc); setDraft(doc.definition);
  }
  async function create(definition: FormSchema) {
    const result = await apiRequest(`${base}/forms`, documentEnvelope, { method: 'POST', body: JSON.stringify({ definition }) });
    replace(result.data); setMode('build'); setNotice('');
  }
  async function save() {
    if (!active || !draft) return;
    try {
      const result = await apiRequest(`${base}/forms/${draft.id}`, documentEnvelope, { method: 'PUT', body: JSON.stringify({ expectedVersion: active.version, definition: draft }) });
      replace(result.data); setConflict(null); setNotice(''); return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        const latest = (await apiRequest(`${base}/forms/${draft.id}`, documentEnvelope)).data;
        setConflict({ base: active.definition, local: draft, latest }); setNotice(''); return false;
      }
      throw error;
    }
  }
  async function loadResponses(formId: string) {
    setTrash([]); setTrashCursor(null);
    setShareableFormId(null);
    const integration = await apiRequest(`${base}/forms/${formId}/integration`, z.object({ data: z.object({ policy: integrationPolicySchema }) }));
    if (integration.data.policy.mode === 'public') setShareableFormId(formId);
    const loaded: FormResponseRecord[] = [];
    let after: string | null = null;
    do {
      const page: z.infer<typeof responsePage> = await apiRequest(`${base}/forms/${formId}/submissions?limit=100${after ? `&cursor=${after}` : ''}`, responsePage);
      loaded.push(...page.data); after = page.nextCursor;
    } while (after);
    const history: FormRevisionSnapshot[] = [];
    const fullRevisions: FormSchema[] = [];
    let revisionCursor: number | null = null;
    do {
      const page: z.infer<typeof revisionPage> = await apiRequest(`${base}/forms/${formId}/revisions?limit=100${revisionCursor ? `&cursor=${revisionCursor}` : ''}`, revisionPage);
      history.push(...page.data.flatMap((r) => r.legacySnapshot ? [r.legacySnapshot] : r.definition ? [createRevisionSnapshot(r.definition)] : []));
      fullRevisions.push(...page.data.flatMap((r) => r.definition ? [r.definition] : []));
      revisionCursor = page.nextCursor;
    } while (revisionCursor);
    const events: AnalyticsEvent[] = []; let eventCursor: string | null = null;
    do {
      const page: z.infer<typeof analyticsPage> = await apiRequest(`${base}/forms/${formId}/analytics-events?limit=100${eventCursor ? `&cursor=${eventCursor}` : ''}`, analyticsPage);
      events.push(...page.data); eventCursor = page.nextCursor;
    } while (eventCursor);
    setResponses(loaded); setRevisions(history); setAnalyticsEvents(events);
    setDocuments((prev) => prev.map((d) => d.definition.id === formId ? { ...d, responseCount: loaded.length } : d));
    return { responses: loaded, revisions: history, fullRevisions, events };
  }
  const updateDraft = (updater: (prev: FormSchema) => FormSchema, options?: RecordChangeOptions) => {
    if (!draft || busy) return;
    const next = updater(draft);
    const normalized = { ...next, questionOrder: next.questions.map((q) => q.id) };
    history.recordChange(draft.id, draft, normalized, options);
    setHistoryVersion((v) => v + 1); setDraft(normalized);
  };
  function undo() {
    if (!draft) return;
    const result = history.undo(draft.id, draft);
    if (result) { setDraft(result.form); setHistoryVersion((v) => v + 1); }
  }
  function redo() {
    if (!draft) return;
    const result = history.redo(draft.id, draft);
    if (result) { setDraft(result.form); setHistoryVersion((v) => v + 1); }
  }
  function open(formId: string, tab: 'build' | 'flow' | 'design' | 'responses' = 'build') {
    const doc = documents.find((d) => d.definition.id === formId);
    if (!doc) return;
    replace(doc); setMode(tab); setSelected({ kind: 'welcome' });
    if (tab === 'responses') void run(async () => { await loadResponses(formId); });
  }

  return <main className="min-h-screen">
    <WorkspaceHeader userName={userName} title={active && !['library', 'developers', 'archive', 'data'].includes(mode) ? draft?.title : undefined} onTitleChange={(title) => updateDraft((prev) => ({ ...prev, title }), { label: 'Rename form', coalesceKey: `form-title-${draft?.id}` })} mode={mode} busy={busy} dirty={dirty} published={Boolean(active?.publishedRevision)} canUndo={Boolean(draft && history.canUndo(draft.id))} canRedo={Boolean(draft && history.canRedo(draft.id))} onUndo={undo} onRedo={redo} onNavigate={navigate} onSave={() => void run(save)} onPublish={() => void run(async () => {
      if (!active) return;
      const result = await apiRequest(`${base}/forms/${active.definition.id}/publish`, documentEnvelope, { method: 'POST', body: JSON.stringify({ expectedVersion: active.version }) });
      replace(result.data); setNotice('Form published.');
    })} onSignOut={() => { if (dirty) setPendingNavigation('signout'); else void run(signOut); }} />
    {notice && <div role="status" className="px-5 py-2 text-sm bg-[#F6D97A]/30 flex justify-between gap-4">{notice}<button onClick={() => setNotice('')} className="text-xs underline">Dismiss</button></div>}
    {conflict && <ConflictReview {...conflict} onDownload={() => download('plyli-unsaved-draft.json', conflict.local)} onResolve={(definition) => { setActive(conflict.latest); setDocuments((prev) => prev.map((d) => d.definition.id === definition.id ? conflict.latest : d)); setDraft(definition); setConflict(null); setNotice('Review your draft, then save.'); }} />}
    {pendingNavigation && <section className="m-5 p-5 border-2 border-[#2A2623] rounded-2xl bg-[#FFFDF9] space-y-3" aria-label="Unsaved changes"><h2 className="font-display font-bold text-lg">Save your changes before leaving?</h2><p className="text-sm">Your draft has unsaved changes.</p><div className="flex flex-wrap gap-2"><PaperButton disabled={busy} variant="coral" onClick={() => void run(async () => { if (await save()) { const destination = pendingNavigation; setPendingNavigation(null); if (destination === 'signout') await signOut(); else { setActive(null); setDraft(null); setMode(destination); if (destination === 'archive') { const page = await apiRequest(`${base}/forms?archived=true&limit=100`, formPage); setArchived(page.data); setArchiveCursor(page.nextCursor); } } } })}>Save and continue</PaperButton><PaperButton onClick={() => { const destination = pendingNavigation; setPendingNavigation(null); setConflict(null); setDraft(active?.definition ?? null); if (destination === 'signout') void run(signOut); else { setMode(destination); setActive(null); setDraft(null); if (destination === 'archive') void run(async () => { const page = await apiRequest(`${base}/forms?archived=true&limit=100`, formPage); setArchived(page.data); setArchiveCursor(page.nextCursor); }); } }}>Discard changes</PaperButton><PaperButton variant="ghost" onClick={() => setPendingNavigation(null)}>Keep editing</PaperButton></div></section>}
    {mode === 'developers' && <DeveloperSettings workspaceId={workspaceId} forms={documents} />}
    {mode === 'data' && <RetentionSettings workspaceId={workspaceId} />}
    {mode === 'archive' && <section className="max-w-5xl mx-auto p-5 sm:p-8 space-y-5"><h1 className="font-display font-bold text-3xl">Archived forms</h1><p className="text-sm text-[#6E655E]">Restore a form with its revisions and responses. Restored forms remain unpublished until you publish them again.</p>{!archived.length && <p className="py-10">No archived forms.</p>}{archived.map((doc) => <article key={doc.definition.id} className="rounded-2xl border-2 border-[#2A2623] p-5 bg-[#FFFDF9] flex items-center justify-between gap-5"><div><h2 className="font-semibold">{doc.definition.title}</h2><p className="text-xs text-[#6E655E] mt-1">Archived {doc.archivedAt ? new Date(doc.archivedAt).toLocaleDateString() : ''}</p></div><PaperButton size="sm" disabled={busy} onClick={() => void run(async () => { const restored = await apiRequest(`${base}/forms/${doc.definition.id}/restore`, documentEnvelope, { method: 'POST', body: JSON.stringify({ expectedVersion: doc.version }) }); setDocuments((prev) => [restored.data, ...prev]); setArchived((prev) => prev.filter((d) => d.definition.id !== doc.definition.id)); setNotice('Form restored as an unpublished draft.'); })}>Restore form</PaperButton></article>)}{archiveCursor && <PaperButton disabled={busy} onClick={() => void run(async () => { const page = await apiRequest(`${base}/forms?archived=true&limit=100&cursor=${archiveCursor}`, formPage); setArchived((prev) => [...prev, ...page.data]); setArchiveCursor(page.nextCursor); })}>Load more archived forms</PaperButton>}</section>}
    {mode === 'library' && <>
      <FormLibrary persistenceMode="account" forms={documents.map((d) => d.definition)} responseCounts={Object.fromEntries(documents.map((d) => [d.definition.id, d.responseCount]))} responses={[]}
        onCreateBlankForm={() => void run(async () => create(createBlankForm()))}
        onCreateFromTemplate={(tpl) => void run(async () => create(tpl.createForm()))}
        onOpenForm={open} onPreviewForm={(id) => { open(id); setMode('preview'); }}
        onRenameForm={(id, title, description) => void run(async () => {
          const current = documents.find((d) => d.definition.id === id); if (!current) return;
          const result = await apiRequest(`${base}/forms/${id}`, documentEnvelope, { method: 'PUT', body: JSON.stringify({ expectedVersion: current.version, definition: { ...current.definition, title, description: description ?? current.definition.description } }) });
          setDocuments((prev) => prev.map((d) => d.definition.id === id ? result.data : d)); setNotice('Saved to your account.');
        })}
        onDuplicateForm={(id) => void run(async () => {
          const source = documents.find((d) => d.definition.id === id); if (!source) return;
          await create({ ...source.definition, id: crypto.randomUUID(), title: `${source.definition.title} (Copy)` });
        })}
        onDeleteForm={(id) => void run(async () => {
          const current = documents.find((d) => d.definition.id === id); if (!current) return;
          await apiRequest(`${base}/forms/${id}`, acknowledgement, { method: 'DELETE', body: JSON.stringify({ expectedVersion: current.version }) });
          setDocuments((prev) => prev.filter((d) => d.definition.id !== id)); setNotice('Form archived. Historical responses are retained.');
        })}
        onExportBackup={(id) => void run(async () => {
          const targets = id ? documents.filter((d) => d.definition.id === id) : documents;
          if (cursor && !id) throw new Error('Load all forms before exporting the workspace.');
          const allResponses: FormResponseRecord[] = []; const allRevisions: FormRevisionSnapshot[] = []; const fullRevisions: FormSchema[] = []; const allEvents: AnalyticsEvent[] = [];
          for (const target of targets) { const data = await loadResponses(target.definition.id); allResponses.push(...data.responses); allRevisions.push(...data.revisions); fullRevisions.push(...data.fullRevisions); allEvents.push(...data.events); }
          download('plyli-account-backup.json', { schemaVersion: 2, app: 'plyli', exportedAt: new Date().toISOString(), forms: targets.map((t) => t.definition), responses: allResponses, revisions: allRevisions, fullRevisions, analyticsEvents: allEvents });
          setNotice('Backup downloaded.');
        })}
        onImportBackup={async (raw) => {
          if (operationLock.current) return { valid: false, error: 'Wait for the current operation to finish.' };
          operationLock.current = true; setBusy(true);
          try {
            const input: unknown = JSON.parse(raw);
            await apiRequest(`${base}/imports`, z.object({ data: z.object({ forms: z.number(), responses: z.number(), revisions: z.number(), analyticsEvents: z.number() }) }), { method: 'POST', body: JSON.stringify(input) });
            const page = await apiRequest(`${base}/forms?limit=100`, formPage); setDocuments(page.data); setCursor(page.nextCursor);
            setNotice('Backup imported.'); return { valid: true };
          } catch (error) { return { valid: false, error: error instanceof Error ? error.message : 'Invalid backup.' }; }
          finally { operationLock.current = false; setBusy(false); }
        }}
        onRestoreStarterForms={() => void run(async () => {
          for (const tpl of FORM_TEMPLATES) await create(tpl.createForm());
          setMode('library'); setNotice('Starter forms added; existing forms were preserved.');
        })}
      />
      {cursor && <PaperButton className="m-5" disabled={busy} onClick={() => void run(async () => {
        const page = await apiRequest(`${base}/forms?limit=100&cursor=${cursor}`, formPage); setDocuments((prev) => [...prev, ...page.data]); setCursor(page.nextCursor);
      })}>Load more forms</PaperButton>}
    </>}
    {draft && active && <>
      {mode === 'integration' && <>
        <IntegrationSettings workspaceId={workspaceId} formId={draft.id} publicUrl={active.publishedRevision ? `/f/${active.publicSlug}` : undefined} onSaved={(version) => { setActive((prev) => prev ? { ...prev, version } : prev); setDocuments((prev) => prev.map((d) => d.definition.id === draft.id ? { ...d, version } : d)); }} />
        {active.publishedRevision && <div className="max-w-4xl mx-auto px-8 pb-8"><PaperButton size="sm" disabled={dirty || busy} onClick={() => void run(async () => { replace((await apiRequest(`${base}/forms/${active.definition.id}/unpublish`, documentEnvelope, { method: 'POST', body: JSON.stringify({ expectedVersion: active.version }) })).data); setNotice('Unpublished. Existing responses remain available.'); })}>Unpublish</PaperButton></div>}
      </>}
      {mode === 'build' && <FormBuilder form={draft} selectedNode={selected} onSelectNode={setSelected} onUpdateForm={updateDraft} onSwitchToFlow={(id) => { setFlowQuestion(id); setMode('flow'); }} onSwitchToDesign={() => setMode('design')} onLaunchPreview={() => setMode('preview')} />}
      {mode === 'flow' && <FlowEditor form={draft} initialSelectedQuestionId={flowQuestion} onSelectBuilderNode={(id) => { setSelected(id === 'welcome' ? { kind: 'welcome' } : id === 'completion' ? { kind: 'completion' } : { kind: 'question', questionId: id }); setMode('build'); }} onUpdateForm={updateDraft} onLaunchPreview={() => setMode('preview')} />}
      {mode === 'design' && <AppearanceEditor form={draft} onUpdateForm={updateDraft} onLaunchPreview={() => setMode('preview')} />}
      {mode === 'preview' && <FormPresentation form={draft} completionNotice="Preview complete. No response was submitted." storageLabel="Preview · Test answers are not submitted." onClosePreview={() => setMode('build')} onInspectResponses={() => setMode('responses')} onSaveResponse={() => { setNotice('Preview complete. No response was submitted.'); }} />}
      {mode === 'responses' && <ResponsesView persistenceMode="account" publicFormUrl={active.publishedRevision && shareableFormId === draft.id && typeof window !== 'undefined' ? `${window.location.origin}/f/${active.publicSlug}` : undefined} form={draft} responses={responses} revisions={revisions} analyticsEvents={analyticsEvents} onLaunchPreview={() => setMode('preview')}
        onDeleteResponse={(id) => void run(async () => { await apiRequest(`${base}/forms/${draft.id}/submissions/${id}`, z.object({ data: z.object({ deleted: z.number() }) }), { method: 'DELETE' }); await loadResponses(draft.id); setNotice('Response moved to trash. You can recover it during the recovery window.'); })}
        onClearFormResponses={() => void run(async () => { await apiRequest(`${base}/forms/${draft.id}/submissions`, z.object({ data: z.object({ deleted: z.number() }) }), { method: 'DELETE' }); await loadResponses(draft.id); setNotice('Responses moved to trash.'); })}
        onExportFormResponses={() => download('plyli-responses.json', { responses, revisions })} />}
      {mode === 'responses' && <section className="max-w-7xl mx-auto p-5 space-y-4"><PaperButton size="sm" disabled={busy} onClick={() => void run(async () => { const page = await apiRequest(`${base}/forms/${draft.id}/submissions/trash?limit=100`, trashPage); setTrash(page.data.map((r) => r.record)); setTrashCursor(page.nextCursor); setNotice(page.data.length ? 'Deleted responses can be restored before the recovery window expires.' : 'Response trash is empty.'); })}>Open response trash</PaperButton>{trash.map((record) => <article key={record.id} className="flex items-center gap-4 p-4 border border-[#2A2623]/30 bg-[#FFFDF9] rounded-xl"><span className="text-sm">Response from {new Date(record.submittedAt).toLocaleString()}</span><PaperButton size="sm" disabled={busy} onClick={() => void run(async () => { await apiRequest(`${base}/forms/${draft.id}/submissions/${record.id}/restore`, z.object({ data: z.object({ restored: z.boolean() }) }), { method: 'POST' }); await loadResponses(draft.id); setNotice('Response restored.'); })}>Restore response</PaperButton></article>)}{trashCursor && <PaperButton size="sm" onClick={() => void run(async () => { const page = await apiRequest(`${base}/forms/${draft.id}/submissions/trash?limit=100&cursor=${trashCursor}`, trashPage); setTrash((prev) => [...prev, ...page.data.map((r) => r.record)]); setTrashCursor(page.nextCursor); })}>Load more deleted responses</PaperButton>}</section>}
    </>}
  </main>;
}
