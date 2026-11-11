'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { FormLibrary } from './form-library';
import { FormBuilder, type SelectedBuilderNode } from './form-builder';
import { FlowEditor } from './flow-editor';
import { AppearanceEditor } from './appearance-editor';
import { FormPresentation } from './form-presentation';
import { ResponsesView } from './responses-view';
import { PaperButton } from './paper-primitives';
import { apiRequest, HttpError } from '@/lib/api-client';
import { reconcileSavedDraft } from '@/lib/draft-save';
import { WorkspaceHeader, type WorkspaceMode } from './workspace-header';
import { DataSettings, DeveloperSettings, IntegrationSettings } from './developer-settings';
import type { JsonImportResult } from './json-import-dialog';
import { ConflictReview } from './conflict-review';
import { ShareForm } from './share-form';
import { authClient } from '@/lib/auth-client';
import { formDocumentSchema, responseRecordSchema, revisionSnapshotSchema, formDefinitionSchema, analyticsEventSchema, type FormDocument } from '@/core/contracts';
import { sharingSchema } from '@/lib/form-sharing';
import { prepareFormDraft } from '@/lib/form-draft';
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

export function AccountWorkspace({ userName, userImage, workspaceId, initialForms, initialCursor }: { userName: string; userImage?: string | null; workspaceId: string; initialForms: FormDocument[]; initialCursor: string | null }) {
  const [documents, setDocuments] = useState(initialForms);
  const [cursor, setCursor] = useState(initialCursor);
  const [active, setActive] = useState<FormDocument | null>(null);
  const [draft, setDraft] = useState<FormSchema | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>('library');
  const [selected, setSelected] = useState<SelectedBuilderNode>({ kind: 'welcome' });
  const [notice, setNotice] = useState('');
  const [pendingNavigation, setPendingNavigation] = useState<WorkspaceMode | 'signout' | 'account' | null>(null);
  const [shareFormId, setShareFormId] = useState<string | null>(null);
  const [previewQuery, setPreviewQuery] = useState<string>();
  const [conflict, setConflict] = useState<{ base: FormSchema; local: FormSchema; latest: FormDocument } | null>(null);
  const [archived, setArchived] = useState<FormDocument[]>([]);
  const [archiveCursor, setArchiveCursor] = useState<string | null>(null);
  const [trash, setTrash] = useState<{ formId: string; page: z.infer<typeof trashPage> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const operationLock = useRef(false);
  const [responses, setResponses] = useState<FormResponseRecord[]>([]);
  const [revisions, setRevisions] = useState<FormRevisionSnapshot[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [publicLink, setPublicLink] = useState<{ formId: string; slug: string } | null>(null);
  const [history] = useState(() => new FormHistoryManager(50, 800));
  const [, setHistoryVersion] = useState(0);
  const [flowQuestion, setFlowQuestion] = useState<string | undefined>();
  const dirty = Boolean(active && draft && JSON.stringify(active.definition) !== JSON.stringify(draft));
  const shareDocument = documents.find((document) => document.definition.id === shareFormId);
  const base = `workspaces/${workspaceId}`;
  async function signOut() { await authClient.signOut(); window.location.assign('/login'); }
  function navigate(next: WorkspaceMode) {
    if (dirty && ['library', 'developers', 'archive', 'data'].includes(next)) { setPendingNavigation(next); return; }
    setMode(next); setNotice('');
    if (['library', 'developers', 'archive', 'data'].includes(next)) { setActive(null); setDraft(null); }
    if (next === 'archive') void run(async () => { const page = await apiRequest(`${base}/forms?archived=true&limit=100`, formPage); setArchived(page.data); setArchiveCursor(page.nextCursor); });
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    if (operationLock.current) return;
    operationLock.current = true; setBusy(true);
    try { await operation(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to complete the operation.'); }
    finally { operationLock.current = false; setBusy(false); }
  }, []);
  function replace(doc: FormDocument) {
    setDocuments((prev) => [doc, ...prev.filter((d) => d.definition.id !== doc.definition.id)]);
    setActive(doc); setDraft(doc.definition);
    setSaveFailed(false);
  }
  async function create(definition: FormSchema) {
    const result = await apiRequest(`${base}/forms`, documentEnvelope, { method: 'POST', body: JSON.stringify({ definition }) });
    replace(result.data); setMode('build'); setNotice('');
  }
  async function submitJson(raw: string, action: (input: unknown) => Promise<void>): Promise<JsonImportResult> {
    if (operationLock.current) return { valid: false, error: 'Wait for the current operation to finish.' };
    operationLock.current = true;
    setBusy(true);
    try {
      let input: unknown;
      try {
        input = JSON.parse(raw);
      } catch {
        return { valid: false, error: 'This is not valid JSON. Check the syntax and try again.' };
      }
      await action(input);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Could not import the JSON.' };
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  function importWorkspaceBackup(raw: string) {
    return submitJson(raw, async (input) => {
      const counts = z.object({ data: z.object({ forms: z.number(), responses: z.number(), revisions: z.number(), analyticsEvents: z.number() }) });
      await apiRequest(`${base}/imports`, counts, { method: 'POST', body: JSON.stringify(input) });
      try {
        const page = await apiRequest(`${base}/forms?limit=100`, formPage);
        setDocuments(page.data);
        setCursor(page.nextCursor);
        setNotice('Backup imported. Open Forms to review your drafts.');
      } catch {
        setNotice('Backup imported. Refresh the page to see the imported forms.');
      }
    });
  }
  const save = useCallback(async () => {
    if (!active || !draft) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const result = await apiRequest(`${base}/forms/${draft.id}`, documentEnvelope, { method: 'PUT', body: JSON.stringify({ expectedVersion: active.version, definition: draft }) });
      const saved = result.data;
      setDocuments((prev) => prev.map((doc) => doc.definition.id === draft.id ? saved : doc));
      setActive((prev) => prev?.definition.id === draft.id ? saved : prev);
      setDraft((current) => reconcileSavedDraft(current, draft, saved.definition));
      setConflict(null);
      return true;
    } catch (error) {
      setSaveFailed(true);
      if (error instanceof HttpError && error.status === 409) {
        const latest = (await apiRequest(`${base}/forms/${draft.id}`, documentEnvelope)).data;
        setConflict({ base: active.definition, local: draft, latest }); setNotice(''); return false;
      }
      throw error;
    } finally {
      setSaving(false);
    }
  }, [active, base, draft]);
  useEffect(() => {
    if (!dirty || busy || conflict || saveFailed || pendingNavigation) return;
    const timer = window.setTimeout(() => {
      void run(async () => {
        setAutoSaving(true);
        try { await save(); }
        finally { setAutoSaving(false); }
      });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [dirty, busy, conflict, saveFailed, pendingNavigation, run, save]);
  const loadResponses = useCallback(async (formId: string, updateView = true) => {
    if (updateView) {
      setPublicLink(null);
      const { data: sharing } = await apiRequest(`/api/studio/${workspaceId}/forms/${formId}/sharing`, z.object({ data: sharingSchema }));
      if (sharing.publicAccess && sharing.published) setPublicLink({ formId, slug: sharing.slug });
    }
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
    if (updateView) {
      setResponses(loaded);
      setRevisions(history);
      setAnalyticsEvents(events);
      setDocuments((prev) => prev.map((d) => d.definition.id === formId ? { ...d, responseCount: loaded.length } : d));
    }
    return { responses: loaded, revisions: history, fullRevisions, events };
  }, [base, workspaceId]);

  function exportBackup(formId?: string) {
    void run(async () => {
      setNotice('Preparing backup…');
      const targets: FormDocument[] = [];
      if (formId) {
        const { data } = await apiRequest(`${base}/forms/${formId}`, documentEnvelope);
        targets.push(data);
      } else {
        let after: string | null = null;
        do {
          const path = `${base}/forms?limit=100${after ? `&cursor=${encodeURIComponent(after)}` : ''}`;
          const page: z.infer<typeof formPage> = await apiRequest(path, formPage);
          targets.push(...page.data);
          after = page.nextCursor;
        } while (after);
      }
      const responses: FormResponseRecord[] = [];
      const revisions: FormRevisionSnapshot[] = [];
      const fullRevisions: FormSchema[] = [];
      const analyticsEvents: AnalyticsEvent[] = [];
      for (const { definition } of targets) {
        const data = await loadResponses(definition.id, false);
        responses.push(...data.responses);
        revisions.push(...data.revisions);
        fullRevisions.push(...data.fullRevisions);
        analyticsEvents.push(...data.events);
      }
      download('plyli-account-backup.json', {
        schemaVersion: 2, app: 'plyli', exportedAt: new Date().toISOString(),
        forms: targets.map(({ definition }) => definition), responses, revisions, fullRevisions, analyticsEvents,
      });
      setNotice('Backup downloaded.');
    });
  }

  async function loadResponseTrash(formId: string, cursor?: string) {
    const path = `${base}/forms/${formId}/submissions/trash?limit=100`;
    const page = await apiRequest(cursor ? `${path}&cursor=${encodeURIComponent(cursor)}` : path, trashPage);
    setTrash((previous) => ({
      formId,
      page: cursor && previous?.formId === formId
        ? { ...page, data: [...previous.page.data, ...page.data] }
        : page,
    }));
  }

  function restoreResponse(formId: string, responseId: string) {
    void run(async () => {
      const path = `${base}/forms/${formId}/submissions/${responseId}/restore`;
      await apiRequest(path, z.object({ data: z.object({ restored: z.boolean() }) }), { method: 'POST' });
      setTrash((previous) => previous?.formId === formId ? {
        formId,
        page: { ...previous.page, data: previous.page.data.filter(({ record }) => record.id !== responseId) },
      } : previous);
      await loadResponses(formId);
      setNotice('Response restored.');
    });
  }

  function unpublishForm(form: FormDocument) {
    void run(async () => {
      const path = `${base}/forms/${form.definition.id}/unpublish`;
      const { data } = await apiRequest(path, documentEnvelope, { method: 'POST', body: JSON.stringify({ expectedVersion: form.version }) });
      replace(data);
      setNotice('Unpublished. Existing responses remain available.');
    });
  }

  const responsesRequested = useRef<string | null>(null);
  const activeId = active?.definition.id;
  const openTrash = trash?.formId === activeId ? trash?.page : undefined;
  useEffect(() => {
    if (mode !== 'responses' || !activeId) {
      responsesRequested.current = null;
      return;
    }
    if (busy || responsesRequested.current === activeId) return;
    responsesRequested.current = activeId;
    void run(() => loadResponses(activeId));
  }, [mode, activeId, busy, loadResponses, run]);
  const updateDraft = (updater: (prev: FormSchema) => FormSchema, options?: RecordChangeOptions) => {
    if (!draft || (busy && !autoSaving)) return;
    const next = updater(draft);
    const normalized = { ...next, questionOrder: next.questions.map((q) => q.id) };
    history.recordChange(draft.id, draft, normalized, options);
    setHistoryVersion((v) => v + 1); setDraft(normalized); setSaveFailed(false);
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
  function open(formId: string, tab: 'build' | 'flow' | 'design' | 'responses' | 'integration' = 'build') {
    if (active?.definition.id === formId) { navigate(tab); return; }
    const doc = documents.find((d) => d.definition.id === formId);
    if (!doc) return;
    replace(doc); setMode(tab); setSelected({ kind: 'welcome' }); setFlowQuestion(undefined);
    setResponses([]); setRevisions([]); setAnalyticsEvents([]); setTrash(null);
  }

  return <main className="min-h-screen">
    {shareDocument && <ShareForm
      key={shareDocument.definition.id}
      title={shareDocument.definition.id === draft?.id ? draft.title : shareDocument.definition.title}
      path={`/api/studio/${workspaceId}/forms/${shareDocument.definition.id}/sharing`}
      onClose={() => setShareFormId(null)}
      onEditor={() => { setShareFormId(null); open(shareDocument.definition.id); }}
      onIntegration={() => { setShareFormId(null); open(shareDocument.definition.id, 'integration'); }}
    />}
    <WorkspaceHeader userName={userName} userImage={userImage} title={active && !['library', 'developers', 'archive', 'data'].includes(mode) ? draft?.title : undefined} onTitleChange={(title) => updateDraft((prev) => ({ ...prev, title }), { label: 'Rename form', coalesceKey: `form-title-${draft?.id}` })} mode={mode} busy={busy} editingLocked={busy && !autoSaving} saving={saving} saveFailed={saveFailed} dirty={dirty} published={Boolean(active?.publishedRevision)} hasUnpublishedChanges={Boolean(active?.publishedRevision && active.definition.revision !== active.publishedRevision)} canUndo={Boolean(draft && history.canUndo(draft.id))} canRedo={Boolean(draft && history.canRedo(draft.id))} onUndo={undo} onRedo={redo} onNavigate={navigate} onShare={() => setShareFormId(active?.definition.id ?? null)} onAccount={() => { if (dirty) setPendingNavigation('account'); else window.location.assign('/account'); }} onSave={() => void run(save)} onPublish={() => void run(async () => {
      if (!active) return;
      const result = await apiRequest(`${base}/forms/${active.definition.id}/publish`, documentEnvelope, { method: 'POST', body: JSON.stringify({ expectedVersion: active.version }) });
      replace(result.data); setNotice('Form published.');
      setShareFormId(result.data.definition.id);
    })} onSignOut={() => { if (dirty) setPendingNavigation('signout'); else void run(signOut); }} />
    {notice && <div role="status" className="px-5 py-2 text-sm bg-[#F6D97A]/30 flex justify-between gap-4">{notice}<button onClick={() => setNotice('')} className="text-xs underline">Dismiss</button></div>}
    {conflict && <ConflictReview {...conflict} local={draft ?? conflict.local} onDownload={() => download('plyli-unsaved-draft.json', draft ?? conflict.local)} onResolve={(definition) => { setActive(conflict.latest); setDocuments((prev) => prev.map((d) => d.definition.id === definition.id ? conflict.latest : d)); setDraft(definition); setConflict(null); setSaveFailed(true); setNotice('Review your draft, then save.'); }} />}
    {pendingNavigation && <section className="m-5 p-5 border-2 border-[#2A2623] rounded-2xl bg-[#FFFDF9] space-y-3" aria-label="Unsaved changes"><h2 className="font-display font-bold text-lg">Save your changes before leaving?</h2><p className="text-sm">Your draft has unsaved changes.</p><div className="flex flex-wrap gap-2"><PaperButton disabled={busy} variant="coral" onClick={() => void run(async () => { if (await save()) { const destination = pendingNavigation; setPendingNavigation(null); if (destination === 'signout') await signOut(); else if (destination === 'account') window.location.assign('/account'); else { setActive(null); setDraft(null); setMode(destination); if (destination === 'archive') { const page = await apiRequest(`${base}/forms?archived=true&limit=100`, formPage); setArchived(page.data); setArchiveCursor(page.nextCursor); } } } })}>Save and continue</PaperButton><PaperButton disabled={busy} onClick={() => { const destination = pendingNavigation; setPendingNavigation(null); setConflict(null); setDraft(active?.definition ?? null); if (destination === 'signout') void run(signOut); else if (destination === 'account') window.location.assign('/account'); else { setMode(destination); setActive(null); setDraft(null); if (destination === 'archive') void run(async () => { const page = await apiRequest(`${base}/forms?archived=true&limit=100`, formPage); setArchived(page.data); setArchiveCursor(page.nextCursor); }); } }}>Discard changes</PaperButton><PaperButton variant="ghost" onClick={() => setPendingNavigation(null)}>Keep editing</PaperButton></div></section>}
    {mode === 'developers' && <DeveloperSettings workspaceId={workspaceId} forms={documents} />}
    {mode === 'data' && <DataSettings workspaceId={workspaceId} busy={busy}
      onExportBackup={() => exportBackup()} onImportBackup={importWorkspaceBackup} />}
    {mode === 'archive' && <section className="max-w-5xl mx-auto p-5 sm:p-8 space-y-5"><h1 className="font-display font-bold text-3xl">Archived forms</h1><p className="text-sm text-[#6E655E]">Restore a form with its revisions and responses. Restored forms remain unpublished until you publish them again.</p>{!archived.length && <p className="py-10">No archived forms.</p>}{archived.map((doc) => <article key={doc.definition.id} className="rounded-2xl border-2 border-[#2A2623] p-5 bg-[#FFFDF9] flex items-center justify-between gap-5"><div><h2 className="font-semibold">{doc.definition.title}</h2><p className="text-xs text-[#6E655E] mt-1">Archived {doc.archivedAt ? new Date(doc.archivedAt).toLocaleDateString() : ''}</p></div><PaperButton size="sm" disabled={busy} onClick={() => void run(async () => { const restored = await apiRequest(`${base}/forms/${doc.definition.id}/restore`, documentEnvelope, { method: 'POST', body: JSON.stringify({ expectedVersion: doc.version }) }); setDocuments((prev) => [restored.data, ...prev]); setArchived((prev) => prev.filter((d) => d.definition.id !== doc.definition.id)); setNotice('Form restored as an unpublished draft.'); })}>Restore form</PaperButton></article>)}{archiveCursor && <PaperButton disabled={busy} onClick={() => void run(async () => { const page = await apiRequest(`${base}/forms?archived=true&limit=100&cursor=${archiveCursor}`, formPage); setArchived((prev) => [...prev, ...page.data]); setArchiveCursor(page.nextCursor); })}>Load more archived forms</PaperButton>}</section>}
    {mode === 'library' && <>
      <FormLibrary persistenceMode="account" publishedIds={new Set(documents.filter((doc) => doc.publishedRevision !== null).map((doc) => doc.definition.id))} onShareForm={setShareFormId} forms={documents.map((d) => d.definition)} responseCounts={Object.fromEntries(documents.map((d) => [d.definition.id, d.responseCount]))} responses={[]}
        onCreateBlankForm={() => void run(async () => create(createBlankForm()))}
        onCreateFromJson={(raw) => submitJson(raw, (input) => create(prepareFormDraft(input)))}
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
        onExportBackup={exportBackup}
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
      {mode === 'integration' && (dirty
        ? <p role="status" className="mx-auto max-w-4xl p-5 text-sm">Save your draft to edit integration settings.</p>
        : <IntegrationSettings
            key={`${draft.id}:${active.publishedRevision ?? 'draft'}`}
            workspaceId={workspaceId}
            formId={draft.id}
            disabled={busy}
            publicUrl={active.publishedRevision ? `/f/${active.publicSlug}` : undefined}
            onUnpublish={() => unpublishForm(active)}
            onSaved={(version) => {
              setActive((prev) => prev ? { ...prev, version } : prev);
              setDocuments((prev) => prev.map((d) => d.definition.id === draft.id ? { ...d, version } : d));
            }}
          />)}
      {mode === 'build' && <FormBuilder form={draft} selectedNode={selected} onSelectNode={setSelected} onUpdateForm={updateDraft} onSwitchToFlow={(id) => { setFlowQuestion(id); setMode('flow'); }} onSwitchToDesign={() => setMode('design')} onLaunchPreview={() => setMode('preview')} />}
      {mode === 'flow' && <FlowEditor form={draft} initialSelectedQuestionId={flowQuestion ?? (selected.kind === 'question' ? selected.questionId : selected.kind)} onOpenBuilder={() => setMode('build')} onSelectBuilderNode={(id) => { setFlowQuestion(id); setSelected(id === 'welcome' ? { kind: 'welcome' } : id === 'completion' ? { kind: 'completion' } : { kind: 'question', questionId: id }); }} onUpdateForm={updateDraft} onLaunchPreview={() => setMode('preview')} />}
      {mode === 'design' && <AppearanceEditor form={draft} onUpdateForm={updateDraft} onLaunchPreview={() => setMode('preview')} />}
      {mode === 'preview' && <FormPresentation form={draft} simulatedUtmQuery={previewQuery} completionNotice="Preview complete. No response was submitted." storageLabel="Preview · Test answers are not submitted." onClosePreview={() => { setPreviewQuery(undefined); setMode('build'); }} onInspectResponses={() => setMode('responses')} onSaveResponse={() => { setNotice('Preview complete. No response was submitted.'); }} />}
      {mode === 'responses' && <ResponsesView persistenceMode="account" publicFormUrl={publicLink?.formId === draft.id && typeof window !== 'undefined' ? `${window.location.origin}/f/${encodeURIComponent(publicLink.slug)}` : undefined} form={draft} responses={responses} revisions={revisions} analyticsEvents={analyticsEvents} onLaunchPreview={(query) => { setPreviewQuery(query); setMode('preview'); }}
        responseTrash={{
          busy,
          onOpen: () => { if (openTrash) setTrash(null); else void run(() => loadResponseTrash(draft.id)); },
          content: openTrash && (
            <section id="response-trash" aria-labelledby="response-trash-title" className="space-y-3 rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-4 shadow-[3px_3px_0_#2A2623] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 id="response-trash-title" className="font-display font-bold">Response trash</h3>
                  <p className="text-xs text-[#6E655E]">Restore deleted responses during the recovery window.</p>
                </div>
                <PaperButton variant="ghost" size="sm" disabled={busy} onClick={() => setTrash(null)}>Close trash</PaperButton>
              </div>
              {!openTrash.data.length && !openTrash.nextCursor && <p className="rounded-lg bg-[#FAF6F0] p-3 text-sm">Response trash is empty.</p>}
              {openTrash.data.length > 0 && <ul className="divide-y divide-[#2A2623]/15 border-t border-[#2A2623]/15">
                {openTrash.data.map(({ record }) => (
                  <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="text-sm">Response from {new Date(record.submittedAt).toLocaleString()}</span>
                    <PaperButton size="sm" disabled={busy} onClick={() => restoreResponse(draft.id, record.id)}>Restore response</PaperButton>
                  </li>
                ))}
              </ul>}
              {openTrash.nextCursor && <PaperButton size="sm" disabled={busy} onClick={() => void run(() => loadResponseTrash(draft.id, openTrash.nextCursor ?? undefined))}>Load more deleted responses</PaperButton>}
            </section>
          ),
        }}
        onDeleteResponse={(id) => void run(async () => { await apiRequest(`${base}/forms/${draft.id}/submissions/${id}`, z.object({ data: z.object({ deleted: z.number() }) }), { method: 'DELETE' }); await loadResponses(draft.id); if (openTrash) await loadResponseTrash(draft.id); setNotice('Response moved to trash. You can recover it during the recovery window.'); })}
        onClearFormResponses={() => void run(async () => { await apiRequest(`${base}/forms/${draft.id}/submissions`, z.object({ data: z.object({ deleted: z.number() }) }), { method: 'DELETE' }); await loadResponses(draft.id); if (openTrash) await loadResponseTrash(draft.id); setNotice('Responses moved to trash.'); })}
        onExportFormResponses={() => download('plyli-responses.json', { responses, revisions })} />}
    </>}
  </main>;
}
