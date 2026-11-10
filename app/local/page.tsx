'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FormSchema,
  FormResponseRecord,
  FormRevisionSnapshot,
  AnalyticsEvent,
  TemplateDefinition,
  RecordChangeOptions,
  FormHistoryManager,
  createInitialSeedWorkspace,
  createBlankForm,
  createRevisionSnapshot,
  reorderFormsList,
  generateId,
  computeFormAnalyticsReport,
  appendAnalyticsEventsWithRetention,
} from '@/lib/form-engine';
import {
  BrowserLocalStorageAdapter,
  applyFormUpdateWithRevisionIntegrity,
} from '@/storage/storage-adapter';
import { PaperButton } from '@/components/paper-primitives';
import { FormLibrary } from '@/components/form-library';
import { FormBuilder, SelectedBuilderNode } from '@/components/form-builder';
import { FlowEditor } from '@/components/flow-editor';
import { AppearanceEditor } from '@/components/appearance-editor';
import { FormPresentation } from '@/components/form-presentation';
import { ResponsesView } from '@/components/responses-view';
import {
  Play,
  Plus,
  ArrowLeft,
  Layers,
  GitBranch,
  Palette,
  MessageSquareText,
  Check,
  Undo2,
  Redo2,
} from 'lucide-react';

type WorkspaceMode =
  | 'library'
  | 'build'
  | 'flow'
  | 'design'
  | 'responses'
  | 'preview';

export default function PlyliRecoveryWorkspace() {
  const [storageAdapter] = useState(() => new BrowserLocalStorageAdapter());
  const [historyManager] = useState(() => new FormHistoryManager(50, 800));
  const [, setHistoryVersion] = useState(0);

  const [forms, setForms] = useState<FormSchema[]>([]);
  const [responses, setResponses] = useState<FormResponseRecord[]>([]);
  const [revisions, setRevisions] = useState<FormRevisionSnapshot[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  const [mode, setMode] = useState<WorkspaceMode>('library');
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [previewUtmQuery, setPreviewUtmQuery] = useState<string | undefined>(
    undefined
  );
  const [selectedBuilderNode, setSelectedBuilderNode] =
    useState<SelectedBuilderNode>({ kind: 'welcome' });
  const [flowTargetQuestionId, setFlowTargetQuestionId] = useState<
    string | undefined
  >(undefined);
  const [lastSavedNotice, setLastSavedNotice] =
    useState<string>('Saved on this device');

  // Load workspace via BrowserLocalStorageAdapter on initial mount
  useEffect(() => {
    const snapshot = storageAdapter.loadWorkspace(() => ({ forms: [], responses: [], revisions: [], analyticsEvents: [] }));
    setForms(snapshot.forms);
    setResponses(snapshot.responses);
    setRevisions(snapshot.revisions);
    setAnalyticsEvents(snapshot.analyticsEvents || []);
    setHasLoadedStorage(true);
  }, [storageAdapter]);

  // Persist workspace via BrowserLocalStorageAdapter whenever forms, responses, revisions, or analyticsEvents change
  useEffect(() => {
    if (!hasLoadedStorage) return;
    const res = storageAdapter.saveWorkspace({
      forms,
      responses,
      revisions,
      analyticsEvents,
    });
    setLastSavedNotice(
      res.ok ? 'Saved on this device' : res.error ?? 'Device storage is full. Export a backup to keep your work.'
    );
  }, [
    forms,
    responses,
    revisions,
    analyticsEvents,
    hasLoadedStorage,
    storageAdapter,
  ]);

  const activeForm =
    forms.find((f) => f.id === activeFormId) || forms[0] || null;

  const activeFlowOverlay = useMemo(() => {
    if (!activeForm) return undefined;
    return computeFormAnalyticsReport(activeForm, responses, analyticsEvents)
      .flowOverlay;
  }, [activeForm, responses, analyticsEvents]);

  const ensureValidSelectedNode = useCallback(
    (nextForm: FormSchema) => {
      setSelectedBuilderNode((prev) => {
        if (prev.kind === 'question') {
          const stillExists = nextForm.questions.some(
            (q) => q.id === prev.questionId
          );
          if (!stillExists) {
            return nextForm.questions[0]
              ? { kind: 'question', questionId: nextForm.questions[0].id }
              : { kind: 'welcome' };
          }
        }
        return prev;
      });
    },
    []
  );

  const openFormWorkspace = (
    formId: string,
    targetTab: 'build' | 'flow' | 'design' | 'responses' = 'build'
  ) => {
    historyManager.commitPending();
    const target = forms.find((f) => f.id === formId);
    setActiveFormId(formId);
    if (target && target.questions.length > 0) {
      setSelectedBuilderNode({
        kind: 'question',
        questionId: target.questions[0].id,
      });
    } else {
      setSelectedBuilderNode({ kind: 'welcome' });
    }
    setMode(targetTab);
  };

  const handleSwitchMode = (nextMode: WorkspaceMode) => {
    historyManager.commitPending(activeForm?.id);
    if (nextMode !== 'preview') {
      setPreviewUtmQuery(undefined);
    }
    setMode(nextMode);
  };

  const handleLaunchPreview = (simulatedUtmQuery?: string) => {
    historyManager.commitPending(activeForm?.id);
    setPreviewUtmQuery(simulatedUtmQuery);
    setMode('preview');
  };

  const handleCreateBlankForm = () => {
    const fresh = createBlankForm();
    const initialSnap = createRevisionSnapshot(fresh);
    setForms((prev) => [fresh, ...prev]);
    setRevisions((prev) => [...prev, initialSnap]);
    setActiveFormId(fresh.id);
    setSelectedBuilderNode({
      kind: 'question',
      questionId: fresh.questions[0].id,
    });
    setMode('build');
  };

  const handleCreateFromTemplate = (tpl: TemplateDefinition) => {
    const created = tpl.createForm();
    const initialSnap = createRevisionSnapshot(created);
    setForms((prev) => [created, ...prev]);
    setRevisions((prev) => [...prev, initialSnap]);
    setActiveFormId(created.id);
    setSelectedBuilderNode({
      kind: 'question',
      questionId: created.questions[0].id,
    });
    setMode('build');
  };

  const handleUpdateActiveForm = useCallback(
    (
      updater: (prev: FormSchema) => FormSchema,
      options?: RecordChangeOptions
    ) => {
      if (!activeForm) return;
      const candidateNext = updater(activeForm);
      const changed = historyManager.recordChange(
        activeForm.id,
        activeForm,
        candidateNext,
        options
      );
      if (changed) {
        setHistoryVersion((v) => v + 1);
      }
      const nextState = applyFormUpdateWithRevisionIntegrity(
        { forms, responses, revisions },
        candidateNext
      );
      setForms(nextState.forms);
      setRevisions(nextState.revisions);
    },
    [activeForm, forms, responses, revisions, historyManager]
  );

  const handleRenameForm = (
    formId: string,
    newTitle: string,
    newDesc?: string,
    coalesceKey?: string
  ) => {
    const target = forms.find((f) => f.id === formId);
    if (!target) return;
    const candidateNext: FormSchema = {
      ...target,
      title: newTitle,
      description: newDesc !== undefined ? newDesc : target.description,
      updatedAt: new Date().toISOString(),
    };
    const changed = historyManager.recordChange(
      target.id,
      target,
      candidateNext,
      {
        label: 'Rename form',
        ...(coalesceKey ? { coalesceKey } : {}),
      }
    );
    if (changed) {
      setHistoryVersion((v) => v + 1);
    }
    const nextState = applyFormUpdateWithRevisionIntegrity(
      { forms, responses, revisions },
      candidateNext
    );
    setForms(nextState.forms);
    setRevisions(nextState.revisions);
  };

  const handleUndo = useCallback(() => {
    if (!activeForm) return;
    const result = historyManager.undo(activeForm.id, activeForm);
    if (!result) return;
    setHistoryVersion((v) => v + 1);
    const nextState = applyFormUpdateWithRevisionIntegrity(
      { forms, responses, revisions },
      result.form
    );
    setForms(nextState.forms);
    setRevisions(nextState.revisions);
    ensureValidSelectedNode(result.form);
  }, [
    activeForm,
    forms,
    responses,
    revisions,
    historyManager,
    ensureValidSelectedNode,
  ]);

  const handleRedo = useCallback(() => {
    if (!activeForm) return;
    const result = historyManager.redo(activeForm.id, activeForm);
    if (!result) return;
    setHistoryVersion((v) => v + 1);
    const nextState = applyFormUpdateWithRevisionIntegrity(
      { forms, responses, revisions },
      result.form
    );
    setForms(nextState.forms);
    setRevisions(nextState.revisions);
    ensureValidSelectedNode(result.form);
  }, [
    activeForm,
    forms,
    responses,
    revisions,
    historyManager,
    ensureValidSelectedNode,
  ]);

  // Global keyboard shortcuts for Undo (Cmd/Ctrl+Z) and Redo (Cmd/Ctrl+Shift+Z or Ctrl+Y)
  useEffect(() => {
    if (mode === 'library' || mode === 'preview' || !activeForm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (historyManager.canUndo(activeForm.id)) {
          e.preventDefault();
          handleUndo();
        }
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.metaKey)) {
        if (historyManager.canRedo(activeForm.id)) {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    const handleFocusOut = () => {
      historyManager.commitPending(activeForm.id);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('focusout', handleFocusOut);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, [mode, activeForm, historyManager, handleUndo, handleRedo]);

  const handleDuplicateForm = (formId: string) => {
    const source = forms.find((f) => f.id === formId);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: FormSchema = {
      ...JSON.parse(JSON.stringify(source)),
      id: generateId('form'),
      revision: 1,
      title: `${source.title} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };
    const snap = createRevisionSnapshot(copy);
    setForms((prev) => [copy, ...prev]);
    setRevisions((prev) => [...prev, snap]);
  };

  const handleDeleteForm = (formId: string) => {
    historyManager.clearFormHistory(formId);
    setForms((prev) => prev.filter((f) => f.id !== formId));
    setResponses((prev) => prev.filter((r) => r.formId !== formId));
    setRevisions((prev) => prev.filter((rev) => rev.formId !== formId));
    setAnalyticsEvents((prev) => prev.filter((e) => e.formId !== formId));
    if (activeFormId === formId) {
      setActiveFormId(null);
      setMode('library');
    }
  };

  const handleReorderForms = (fromIndex: number, toIndex: number) => {
    setForms((prev) => reorderFormsList(prev, fromIndex, toIndex));
  };

  const handleRestoreStarterForms = () => {
    const freshSeed = createInitialSeedWorkspace();
    setForms(freshSeed.forms);
    setResponses(freshSeed.responses);
    setRevisions(freshSeed.revisions);
    setAnalyticsEvents([]);
  };

  const triggerJsonDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportBackup = (singleFormId?: string) => {
    const json = storageAdapter.exportData(singleFormId);
    if (singleFormId) {
      const target = forms.find((f) => f.id === singleFormId);
      const slug = (target?.title || 'form')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      triggerJsonDownload(`plyli-${slug || 'form'}.json`, json);
      return;
    }
    triggerJsonDownload('plyli-workspace-backup.json', json);
  };

  const handleImportBackup = (rawJson: string) => {
    const res = storageAdapter.importData(rawJson);
    if (!res.valid || !res.state) {
      return { valid: false, error: res.error };
    }
    setForms(res.state.forms);
    setResponses(res.state.responses);
    setRevisions(res.state.revisions);
    setAnalyticsEvents(res.state.analyticsEvents || []);
    return { valid: true };
  };

  const handleSaveResponse = (
    newResponse: FormResponseRecord,
    revisionSnapshot?: FormRevisionSnapshot
  ) => {
    setResponses((prev) => [newResponse, ...prev]);
    if (revisionSnapshot) {
      setRevisions((prev) => {
        const exists = prev.some(
          (s) =>
            s.formId === revisionSnapshot.formId &&
            s.revision === revisionSnapshot.revision
        );
        return exists ? prev : [...prev, revisionSnapshot];
      });
    }
  };

  const handleRecordAnalyticsEvent = useCallback((event: AnalyticsEvent) => {
    setAnalyticsEvents((prev) =>
      appendAnalyticsEventsWithRetention(prev, [event])
    );
  }, []);

  const handleDeleteResponse = (responseId: string) => {
    setResponses((prev) => prev.filter((r) => r.id !== responseId));
  };

  const handleClearFormResponses = (formId: string) => {
    setResponses((prev) => prev.filter((r) => r.formId !== formId));
  };

  const handleClearFormAnalytics = (formId: string) => {
    setAnalyticsEvents((prev) => prev.filter((e) => e.formId !== formId));
  };

  const activeFormResponseCount = activeForm
    ? responses.filter((r) => r.formId === activeForm.id).length
    : 0;

  const canUndo = activeForm ? historyManager.canUndo(activeForm.id) : false;
  const canRedo = activeForm ? historyManager.canRedo(activeForm.id) : false;
  const undoLabel = activeForm
    ? historyManager.getUndoLabel(activeForm.id)
    : null;
  const redoLabel = activeForm
    ? historyManager.getRedoLabel(activeForm.id)
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-[#F6D97A]/40 px-4 py-2 text-center text-sm">
        Browser recovery · These forms are saved only on this device.{' '}
        <a href="/dashboard" className="underline font-semibold">Open your workspace</a>
        {' '}to manage your account forms. Export a backup here before importing it into your account.
      </div>
      {/* SINGLE UNIFIED CONTEXTUAL HEADER (No duplicated navigation bars) */}
      {mode !== 'preview' && (
        <header className="sticky top-0 z-40 bg-[#FFFDF9] border-b-2 border-[#2A2623] px-4 sm:px-6 lg:px-8 py-3">
          {mode === 'library' || !activeForm ? (
            /* LIBRARY HEADER */
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('library')}
                  className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[#2A2623] hover:text-[#D4573B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Plyli
                </button>
                <span
                  aria-hidden="true"
                  className="hidden sm:inline text-[#2A2623]/30"
                >
                  ·
                </span>
                <span className="hidden sm:inline text-xs font-semibold text-[#6E655E]">
                  Form Library ({forms.length}{' '}
                  {forms.length === 1 ? 'form' : 'forms'})
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="hidden md:inline-flex items-center gap-1 text-xs font-medium text-[#6E655E]">
                  <Check className="w-3.5 h-3.5 text-[#2A2623]" />
                  <span>{lastSavedNotice}</span>
                </span>
                <PaperButton
                  variant="coral"
                  size="sm"
                  onClick={handleCreateBlankForm}
                >
                  <Plus className="w-4 h-4" />
                  <span>New Form</span>
                </PaperButton>
              </div>
            </div>
          ) : (
            /* FORM EDITOR HEADER: Single authoritative navigation for Build / Flow / Design / Responses + Undo/Redo + Preview */
            <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
              {/* Left Zone: Brand + Back to Library + Editable Form Title + Autosave */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('library')}
                  className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[#2A2623] hover:text-[#D4573B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Plyli
                </button>

                <button
                  type="button"
                  onClick={() => handleSwitchMode('library')}
                  aria-label="Back to Form Library"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs font-bold text-[#2A2623] hover:bg-[#EFE9DE] shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Library</span>
                </button>

                <div className="min-w-0 flex-1 max-w-xs lg:max-w-sm">
                  <label htmlFor="workspace-form-title" className="sr-only">
                    Form Title
                  </label>
                  <input
                    id="workspace-form-title"
                    type="text"
                    value={activeForm.title}
                    onChange={(e) =>
                      handleRenameForm(
                        activeForm.id,
                        e.target.value,
                        undefined,
                        `form-title-${activeForm.id}`
                      )
                    }
                    className="w-full font-display text-sm sm:text-base font-bold text-[#2A2623] bg-transparent border-b border-dashed border-transparent hover:border-[#2A2623]/40 focus:border-[#E86D52] focus:outline-none px-1 py-0.5 truncate"
                  />
                </div>

                <span className="hidden xl:inline-flex items-center gap-1 text-xs font-medium text-[#6E655E] shrink-0">
                  <Check className="w-3.5 h-3.5 text-[#2A2623]" />
                  <span>{lastSavedNotice}</span>
                </span>
              </div>

              {/* Center Zone: Single Authoritative Editor Navigation (Build | Flow | Design | Responses) */}
              <nav
                aria-label="Form editor navigation"
                className="order-3 md:order-2 w-full md:w-auto flex justify-center"
              >
                <div
                  className="flex items-center gap-1 p-1 bg-[#EFE9DE] border-2 border-[#2A2623] rounded-xl max-w-full overflow-x-auto"
                  role="tablist"
                  aria-label="Form editor mode"
                >
                  <button
                    type="button"
                    role="tab"
                    data-testid="editor-tab-build"
                    aria-selected={mode === 'build'}
                    onClick={() => handleSwitchMode('build')}
                    className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex-1 sm:flex-initial ${
                      mode === 'build'
                        ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                        : 'text-[#6E655E] hover:text-[#2A2623]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>Build</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    data-testid="editor-tab-flow"
                    aria-selected={mode === 'flow'}
                    onClick={() => handleSwitchMode('flow')}
                    className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex-1 sm:flex-initial ${
                      mode === 'flow'
                        ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                        : 'text-[#6E655E] hover:text-[#2A2623]'
                    }`}
                  >
                    <GitBranch className="w-3.5 h-3.5 shrink-0" />
                    <span>Flow</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    data-testid="editor-tab-design"
                    aria-selected={mode === 'design'}
                    onClick={() => handleSwitchMode('design')}
                    className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex-1 sm:flex-initial ${
                      mode === 'design'
                        ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                        : 'text-[#6E655E] hover:text-[#2A2623]'
                    }`}
                  >
                    <Palette className="w-3.5 h-3.5 shrink-0" />
                    <span>Design</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    data-testid="editor-tab-responses"
                    aria-selected={mode === 'responses'}
                    onClick={() => handleSwitchMode('responses')}
                    className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex-1 sm:flex-initial ${
                      mode === 'responses'
                        ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                        : 'text-[#6E655E] hover:text-[#2A2623]'
                    }`}
                  >
                    <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
                    <span className="tabular-nums">
                      Responses ({activeFormResponseCount})
                    </span>
                  </button>
                </div>
              </nav>

              {/* Right Zone: Undo / Redo + Preview Action */}
              <div className="order-2 md:order-3 flex items-center gap-2 shrink-0">
                <div
                  className="inline-flex items-center bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl overflow-hidden"
                  role="group"
                  aria-label="History controls"
                >
                  <button
                    type="button"
                    data-testid="editor-undo-button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    aria-label={canUndo ? `Undo: ${undoLabel}` : 'Undo'}
                    title={
                      canUndo
                        ? `Undo: ${undoLabel} (Ctrl/Cmd+Z)`
                        : 'Nothing to undo'
                    }
                    className="p-2 text-[#2A2623] hover:bg-[#EFE9DE] disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed border-r border-[#2A2623]/20"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    data-testid="editor-redo-button"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    aria-label={canRedo ? `Redo: ${redoLabel}` : 'Redo'}
                    title={
                      canRedo
                        ? `Redo: ${redoLabel} (Ctrl/Cmd+Shift+Z)`
                        : 'Nothing to redo'
                    }
                    className="p-2 text-[#2A2623] hover:bg-[#EFE9DE] disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                </div>

                <PaperButton
                  variant="coral"
                  size="sm"
                  onClick={() => handleSwitchMode('preview')}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Preview Form</span>
                </PaperButton>
              </div>
            </div>
          )}
        </header>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1">
        {mode === 'library' && (
          <FormLibrary
            forms={forms}
            responses={responses}
            onCreateBlankForm={handleCreateBlankForm}
            onCreateFromTemplate={handleCreateFromTemplate}
            onOpenForm={(formId, tab) => openFormWorkspace(formId, tab)}
            onPreviewForm={(formId) => {
              setActiveFormId(formId);
              setMode('preview');
            }}
            onRenameForm={(fId, title, desc) =>
              handleRenameForm(fId, title, desc)
            }
            onDuplicateForm={handleDuplicateForm}
            onDeleteForm={handleDeleteForm}
            onReorderForms={handleReorderForms}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onRestoreStarterForms={handleRestoreStarterForms}
          />
        )}

        {mode === 'build' && activeForm && (
          <FormBuilder
            form={activeForm}
            selectedNode={selectedBuilderNode}
            onSelectNode={setSelectedBuilderNode}
            onUpdateForm={handleUpdateActiveForm}
            onSwitchToFlow={(questionId) => {
              if (questionId) {
                setSelectedBuilderNode({ kind: 'question', questionId });
              }
              setFlowTargetQuestionId(questionId);
              handleSwitchMode('flow');
            }}
            onSwitchToDesign={() => handleSwitchMode('design')}
            onLaunchPreview={() => handleSwitchMode('preview')}
          />
        )}

        {mode === 'flow' && activeForm && (
          <FlowEditor
            form={activeForm}
            initialSelectedQuestionId={
              flowTargetQuestionId ||
              (selectedBuilderNode.kind === 'question'
                ? selectedBuilderNode.questionId
                : selectedBuilderNode.kind)
            }
            onSelectBuilderNode={(nodeId) => {
              setFlowTargetQuestionId(undefined);
              if (nodeId === 'welcome') {
                setSelectedBuilderNode({ kind: 'welcome' });
              } else if (nodeId === 'completion') {
                setSelectedBuilderNode({ kind: 'completion' });
              } else {
                setSelectedBuilderNode({ kind: 'question', questionId: nodeId });
              }
            }}
            onUpdateForm={handleUpdateActiveForm}
            onLaunchPreview={() => handleLaunchPreview()}
            flowOverlay={activeFlowOverlay}
          />
        )}

        {mode === 'design' && activeForm && (
          <AppearanceEditor
            form={activeForm}
            onUpdateForm={handleUpdateActiveForm}
            onLaunchPreview={() => handleLaunchPreview()}
          />
        )}

        {mode === 'responses' && activeForm && (
          <ResponsesView
            form={activeForm}
            responses={responses}
            revisions={revisions}
            analyticsEvents={analyticsEvents}
            onLaunchPreview={(utmQuery) => handleLaunchPreview(utmQuery)}
            onDeleteResponse={handleDeleteResponse}
            onClearFormResponses={handleClearFormResponses}
            onClearFormAnalytics={handleClearFormAnalytics}
            onExportFormResponses={(fId) => handleExportBackup(fId)}
            onNavigateToFlowCanvas={() => handleSwitchMode('flow')}
          />
        )}

        {mode === 'preview' && activeForm && (
          <FormPresentation
            form={activeForm}
            simulatedUtmQuery={previewUtmQuery}
            onClosePreview={() => handleSwitchMode('build')}
            onSaveResponse={handleSaveResponse}
            onRecordAnalyticsEvent={handleRecordAnalyticsEvent}
            onInspectResponses={() => handleSwitchMode('responses')}
          />
        )}
      </main>
    </div>
  );
}
