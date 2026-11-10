'use client';

import React, { useState } from 'react';
import {
  FormSchema,
  FormResponseRecord,
  FORM_TEMPLATES,
  TemplateDefinition,
} from '@/lib/form-engine';
import {
  PaperButton,
  SketchUnderline,
  SketchNotebookGraphic,
  SketchEmptyFolderGraphic,
  THEME_PALETTE,
} from './paper-primitives';
import {
  Plus,
  Play,
  Pencil,
  Copy,
  Trash2,
  GitBranch,
  MessageSquareText,
  Download,
  Upload,
  Search,
  Sparkles,
  Check,
  X,
  RotateCcw,
  FileJson,
  Palette,
  GripVertical,
} from 'lucide-react';
import { resolveFormAppearance } from '@/themes/appearance-registry';

interface FormLibraryProps {
  forms: FormSchema[];
  responses: FormResponseRecord[];
  onCreateBlankForm: () => void;
  onCreateFromTemplate: (template: TemplateDefinition) => void;
  onOpenForm: (
    formId: string,
    initialTab?: 'build' | 'flow' | 'design' | 'responses'
  ) => void;
  onPreviewForm: (formId: string) => void;
  onRenameForm: (formId: string, newTitle: string, newDesc?: string) => void;
  onDuplicateForm: (formId: string) => void;
  onDeleteForm: (formId: string) => void;
  onReorderForms?: (fromIndex: number, toIndex: number) => void;
  onExportBackup: (singleFormId?: string) => void;
  onImportBackup: (rawJson: string) => { valid: boolean; error?: string } | Promise<{ valid: boolean; error?: string }>;
  onRestoreStarterForms: () => void;
  persistenceMode?: 'local' | 'account';
  responseCounts?: Record<string, number>;
}

export function FormLibrary({
  forms,
  responses,
  onCreateBlankForm,
  onCreateFromTemplate,
  onOpenForm,
  onPreviewForm,
  onRenameForm,
  onDuplicateForm,
  onDeleteForm,
  onReorderForms,
  onExportBackup,
  onImportBackup,
  onRestoreStarterForms,
  persistenceMode = 'local',
  responseCounts,
}: FormLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'branching' | 'responses'>('all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameDesc, setRenameDesc] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [draggedFormIdx, setDraggedFormIdx] = useState<number | null>(null);
  const [dropTargetFormIdx, setDropTargetFormIdx] = useState<number | null>(null);

  const canReorderCards =
    Boolean(onReorderForms) &&
    activeFilter === 'all' &&
    searchQuery.trim() === '' &&
    forms.length > 1;

  const getResponseCount = (formId: string) =>
    responseCounts?.[formId] ?? responses.filter((r) => r.formId === formId).length;

  const getBranchRuleCount = (form: FormSchema) =>
    form.questions.reduce((acc, q) => acc + (q.logicRules?.length || 0), 0);

  const filteredForms = forms.filter((form) => {
    const matchesSearch =
      form.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeFilter === 'branching') {
      return getBranchRuleCount(form) > 0;
    }
    if (activeFilter === 'responses') {
      return getResponseCount(form.id) > 0;
    }
    return true;
  });

  const startRenaming = (form: FormSchema) => {
    setRenamingId(form.id);
    setRenameTitle(form.title);
    setRenameDesc(form.description);
  };

  const commitRename = (formId: string) => {
    if (renameTitle.trim()) {
      onRenameForm(formId, renameTitle.trim(), renameDesc.trim());
    }
    setRenamingId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportText(reader.result);
        setImportError(null);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    setImportError(null);
    const res = await onImportBackup(importText);
    if (!res.valid) {
      setImportError(res.error || 'Invalid backup JSON.');
    } else {
      setImportSuccess(true);
      setTimeout(() => {
        setImportSuccess(false);
        setIsImportModalOpen(false);
        setImportText('');
      }, 900);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6">
      <section className="relative bg-[#FFFDF9] border-2 border-[#2A2623] rounded-3xl p-5 sm:p-6 lg:p-7 shadow-[4px_4px_0px_#2A2623]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#6E655E]">
              <span>Form & Workflow Studio</span>
              <span aria-hidden="true">·</span>
              <span>{persistenceMode === 'account' ? 'Make forms. Shape flows.' : 'Saved in your browser'}</span>
            </div>
            <h1
              className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#2A2623] tracking-tight leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Craft conversational forms that feel{' '}
              <span className="relative inline-block">
                hand-made
                <SketchUnderline
                  color="#E86D52"
                  className="w-full h-3 absolute -bottom-1 left-0"
                />
              </span>
            </h1>
            <p className="text-sm sm:text-base text-[#6E655E] leading-relaxed">
              Design one-question-at-a-time experiences, wire visual branching paths
              without code, and test responses directly in your browser.
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-2.5">
              <PaperButton
                variant="coral"
                size="md"
                onClick={onCreateBlankForm}
                aria-label="New Form"
              >
                <Plus className="w-4 h-4" />
                <span>New Form</span>
              </PaperButton>

              <PaperButton
                variant="ivory"
                size="md"
                onClick={() => {
                  setImportError(null);
                  setIsImportModalOpen(true);
                }}
              >
                <Upload className="w-4 h-4" />
                <span>Import JSON</span>
              </PaperButton>

              <PaperButton
                variant="ivory"
                size="md"
                onClick={() => onExportBackup()}
              >
                <Download className="w-4 h-4" />
                <span>Export Backup</span>
              </PaperButton>
            </div>
          </div>
          <div className="lg:w-72 shrink-0 bg-[#FAF6F0] border-2 border-[#2A2623] rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <SketchNotebookGraphic className="w-12 h-12 shrink-0" />
              <div>
                <p className="font-display text-base font-bold text-[#2A2623]">
                  Studio Notebook
                </p>
                <p className="text-xs text-[#6E655E]">
                  {persistenceMode === 'account' ? 'Account workspace' : 'Saved on this device'}
                </p>
              </div>
            </div>
            <div className="border-t border-[#2A2623]/15 pt-2.5 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-mono text-lg font-bold text-[#2A2623] tabular-nums">
                  {forms.length}
                </p>
                <p className="text-[11px] text-[#6E655E]">Forms</p>
              </div>
              <div>
                <p className="font-mono text-lg font-bold text-[#2A2623] tabular-nums">
                  {forms.reduce((acc, f) => acc + getBranchRuleCount(f), 0)}
                </p>
                <p className="text-[11px] text-[#6E655E]">Flow Rules</p>
              </div>
              <div>
                <p className="font-mono text-lg font-bold text-[#2A2623] tabular-nums">
                  {responseCounts ? Object.values(responseCounts).reduce((sum, count) => sum + count, 0) : responses.length}
                </p>
                <p className="text-[11px] text-[#6E655E]">{persistenceMode === 'account' ? 'Responses' : 'Preview runs'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section aria-labelledby="templates-heading" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2
              id="templates-heading"
              className="font-display text-lg sm:text-xl font-bold text-[#2A2623]"
            >
              Start from a Sample Template
            </h2>
            <p className="text-xs sm:text-sm text-[#6E655E]">
              Ready-to-use questions and branching rules.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FORM_TEMPLATES.map((tpl) => {
            const palette = THEME_PALETTE[tpl.accentTheme];
            return (
              <div
                key={tpl.id}
                className="flex flex-col justify-between bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[3px_3px_0px_#2A2623] hover:bg-[#FAF6F0] transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#6E655E] font-medium">
                    <span>{tpl.category}</span>
                    <span>
                      <span className="font-mono tabular-nums">{tpl.questionCount}</span>{' '}
                      questions · Branching included
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm border border-[#2A2623] shrink-0"
                      style={{ backgroundColor: palette.bg }}
                      aria-hidden="true"
                    />
                    <h3 className="font-display text-base font-bold text-[#2A2623]">
                      {tpl.name}
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-[#6E655E] leading-relaxed">
                    {tpl.tagline}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#2A2623]/10 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#6E655E]">
                    Ready to customize
                  </span>
                  <PaperButton
                    variant="ivory"
                    size="sm"
                    onClick={() => onCreateFromTemplate(tpl)}
                    aria-label={`Use ${tpl.name} template`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#E86D52]" />
                    <span>Use Template</span>
                  </PaperButton>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="library-heading" className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2
              id="library-heading"
              className="font-display text-2xl font-bold text-[#2A2623]"
            >
              Your Form Workspace
            </h2>
            <p className="text-sm text-[#6E655E]">
              Click any card to open the builder, inspect its flow diagram, or run a
              response test.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <label htmlFor="library-search" className="sr-only">
                Search forms
              </label>
              <Search className="w-4 h-4 text-[#6E655E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="library-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search forms..."
                className="pl-9 pr-4 py-2 text-sm bg-[#FFFDF9] border-2 border-[#2A2623] rounded-xl text-[#2A2623] placeholder:text-[#9C9288] focus:outline-none focus:bg-[#FFF9EB]"
              />
            </div>

            <div
              className="flex items-center gap-1 p-1 bg-[#EFE9DE] border-2 border-[#2A2623] rounded-xl"
              role="group"
              aria-label="Filter forms"
            >
              {(
                [
                  { id: 'all', label: 'All Forms' },
                  { id: 'branching', label: 'With Branching' },
                  { id: 'responses', label: 'With Responses' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeFilter === tab.id
                      ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623]'
                      : 'text-[#6E655E] hover:text-[#2A2623]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {filteredForms.length === 0 ? (
          <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-3xl p-10 text-center max-w-xl mx-auto my-6 shadow-[4px_4px_0px_#2A2623] space-y-5">
            <div className="flex justify-center">
              <SketchEmptyFolderGraphic className="w-28 h-24" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-2xl font-bold text-[#2A2623]">
                {forms.length === 0
                  ? 'Your studio desk is clear and ready'
                  : 'No forms match your current filter'}
              </h3>
              <p className="text-sm text-[#6E655E] max-w-md mx-auto leading-relaxed">
                {forms.length === 0
                  ? 'Create a fresh blank form from scratch, or load our sample templates to explore branching logic and one-question-at-a-time presentation.'
                  : 'Try clearing your search query or switching back to All Forms.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {forms.length === 0 ? (
                <>
                  <PaperButton variant="coral" size="md" onClick={onCreateBlankForm}>
                    <Plus className="w-4 h-4" />
                    <span>Create Blank Form</span>
                  </PaperButton>
                  <PaperButton
                    variant="ivory"
                    size="md"
                    onClick={onRestoreStarterForms}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>{persistenceMode === 'account' ? 'Add Sample Forms' : 'Restore Sample Forms'}</span>
                  </PaperButton>
                </>
              ) : (
                <PaperButton
                  variant="ivory"
                  size="md"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveFilter('all');
                  }}
                >
                  <span>Reset Search & Filter</span>
                </PaperButton>
              )}
            </div>
          </div>
        ) : (
          /* Form Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredForms.map((form, cardIdx) => {
              const palette = THEME_PALETTE[form.accentTheme || 'coral'];
              const activeTokens = resolveFormAppearance(
                form.appearance,
                form.accentTheme
              );
              const responseCount = getResponseCount(form.id);
              const branchCount = getBranchRuleCount(form);
              const isRenaming = renamingId === form.id;
              const isDeleting = deletingId === form.id;
              const isDraggingCard = draggedFormIdx === cardIdx;
              const isDropTargetCard =
                dropTargetFormIdx === cardIdx &&
                draggedFormIdx !== null &&
                draggedFormIdx !== cardIdx;

              return (
                <article
                  key={form.id}
                  data-testid={`library-form-card-${cardIdx}`}
                  draggable={canReorderCards && !isRenaming}
                  onDragStart={(e) => {
                    if (!canReorderCards) return;
                    setDraggedFormIdx(cardIdx);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(cardIdx));
                  }}
                  onDragOver={(e) => {
                    if (!canReorderCards) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dropTargetFormIdx !== cardIdx) {
                      setDropTargetFormIdx(cardIdx);
                    }
                  }}
                  onDrop={(e) => {
                    if (!canReorderCards || !onReorderForms) return;
                    e.preventDefault();
                    const fromIdx =
                      draggedFormIdx ??
                      Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
                    setDraggedFormIdx(null);
                    setDropTargetFormIdx(null);
                    if (Number.isFinite(fromIdx) && fromIdx !== cardIdx) {
                      onReorderForms(fromIdx, cardIdx);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedFormIdx(null);
                    setDropTargetFormIdx(null);
                  }}
                  className={`flex flex-col justify-between bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl overflow-hidden shadow-[4px_4px_0px_#2A2623] transition-all ${
                    isDraggingCard ? 'opacity-45 scale-[0.98]' : ''
                  } ${
                    isDropTargetCard ? 'ring-4 ring-[#E86D52]' : ''
                  }`}
                >
                  <div>
                    <div
                      className="h-3 border-b-2 border-[#2A2623]"
                      style={{ backgroundColor: activeTokens.primaryColor || palette.bg }}
                    />

                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#6E655E] tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {canReorderCards && (
                            <span
                              title="Drag card to reorder in workspace"
                              aria-hidden="true"
                              className="text-[#9C9288] hover:text-[#2A2623] cursor-grab active:cursor-grabbing -ml-1"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <span>Updated {formatDate(form.updatedAt)}</span>
                        </span>
                        <span>
                          <strong className="font-mono text-[#2A2623]">
                            {form.questions.length}
                          </strong>{' '}
                          questions ·{' '}
                          <strong className="font-mono text-[#2A2623]">
                            {responseCount}
                          </strong>{' '}
                          {responseCount === 1 ? 'response' : 'responses'}
                        </span>
                      </div>

                      {isRenaming ? (
                        <div className="space-y-2.5 pt-1">
                          <div>
                            <label
                              htmlFor={`rename-title-${form.id}`}
                              className="block text-xs font-semibold text-[#6E655E] mb-1"
                            >
                              Form Title
                            </label>
                            <input
                              id={`rename-title-${form.id}`}
                              type="text"
                              value={renameTitle}
                              onChange={(e) => setRenameTitle(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm font-bold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`rename-desc-${form.id}`}
                              className="block text-xs font-semibold text-[#6E655E] mb-1"
                            >
                              Description
                            </label>
                            <textarea
                              id={`rename-desc-${form.id}`}
                              rows={2}
                              value={renameDesc}
                              onChange={(e) => setRenameDesc(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none resize-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <PaperButton
                              variant="coral"
                              size="sm"
                              onClick={() => commitRename(form.id)}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </PaperButton>
                            <PaperButton
                              variant="ivory"
                              size="sm"
                              onClick={() => setRenamingId(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </PaperButton>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-display text-xl font-bold text-[#2A2623] leading-snug">
                            <button
                              type="button"
                              onClick={() => onOpenForm(form.id, 'build')}
                              className="text-left hover:text-[#D4573B] transition-colors cursor-pointer"
                            >
                              {form.title}
                            </button>
                          </h3>
                          <p className="text-sm text-[#6E655E] line-clamp-2 leading-relaxed">
                            {form.description || 'No description added yet.'}
                          </p>
                        </>
                      )}
                      <div className="pt-2 flex flex-wrap items-center gap-2.5 text-xs font-semibold text-[#2A2623]">
                        <button
                          type="button"
                          onClick={() => onOpenForm(form.id, 'flow')}
                          className="inline-flex items-center gap-1 text-[#6E655E] hover:text-[#2A2623] underline decoration-dashed underline-offset-4 cursor-pointer"
                        >
                          <GitBranch className="w-3.5 h-3.5 text-[#E86D52]" />
                          <span className="tabular-nums">
                            {branchCount} {branchCount === 1 ? 'flow rule' : 'flow rules'}
                          </span>
                        </button>
                        <span aria-hidden="true" className="text-[#6E655E]">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenForm(form.id, 'design')}
                          className="inline-flex items-center gap-1 text-[#6E655E] hover:text-[#2A2623] underline decoration-dashed underline-offset-4 cursor-pointer"
                        >
                          <Palette className="w-3.5 h-3.5 text-[#E86D52]" />
                          <span>{activeTokens.templateName} Theme</span>
                        </button>
                        <span aria-hidden="true" className="text-[#6E655E]">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenForm(form.id, 'responses')}
                          className="inline-flex items-center gap-1 text-[#6E655E] hover:text-[#2A2623] underline decoration-dashed underline-offset-4 cursor-pointer"
                        >
                          <MessageSquareText className="w-3.5 h-3.5 text-[#2A2623]" />
                          <span className="tabular-nums">
                            {responseCount}{' '}
                            {responseCount === 1 ? 'response' : 'responses'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-3.5 bg-[#FAF6F0] border-t-2 border-[#2A2623] flex items-center justify-between gap-2">
                    {isDeleting ? (
                      <div className="w-full flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#D4573B]">
                          {persistenceMode === 'account' ? 'Archive this form? Responses and history are retained.' : 'Delete this form?'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <PaperButton
                            variant="coral"
                            size="sm"
                            onClick={() => {
                              onDeleteForm(form.id);
                              setDeletingId(null);
                            }}
                              aria-label={`Confirm ${persistenceMode === 'account' ? 'archive' : 'delete'} ${form.title}`}
                          >
                            <span>Confirm</span>
                          </PaperButton>
                          <PaperButton
                            variant="ivory"
                            size="sm"
                            onClick={() => setDeletingId(null)}
                          >
                            <span>Keep</span>
                          </PaperButton>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <PaperButton
                            variant="coral"
                            size="sm"
                            onClick={() => onOpenForm(form.id, 'build')}
                            aria-label={`Edit ${form.title}`}
                          >
                            <span>Edit Form</span>
                          </PaperButton>
                          <PaperButton
                            variant="yellow"
                            size="sm"
                            onClick={() => onPreviewForm(form.id)}
                            aria-label={`Preview ${form.title}`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Preview</span>
                          </PaperButton>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startRenaming(form)}
                            title={`Rename ${form.title}`}
                            aria-label={`Rename ${form.title}`}
                            className="p-2 rounded-lg text-[#6E655E] hover:text-[#2A2623] hover:bg-[#EFE9DE] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateForm(form.id)}
                            title={`Duplicate ${form.title}`}
                            aria-label={`Duplicate ${form.title}`}
                            className="p-2 rounded-lg text-[#6E655E] hover:text-[#2A2623] hover:bg-[#EFE9DE] transition-colors cursor-pointer"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportBackup(form.id)}
                            title={`Export ${form.title} as JSON`}
                            aria-label={`Export ${form.title} JSON`}
                            className="p-2 rounded-lg text-[#6E655E] hover:text-[#2A2623] hover:bg-[#EFE9DE] transition-colors cursor-pointer"
                          >
                            <FileJson className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(form.id)}
                            title={`${persistenceMode === 'account' ? 'Archive' : 'Delete'} ${form.title}`}
                            aria-label={`${persistenceMode === 'account' ? 'Archive' : 'Delete'} ${form.title}`}
                            className="p-2 rounded-lg text-[#6E655E] hover:text-[#D4573B] hover:bg-[#FDECE8] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {isImportModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#2A2623]/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-dialog-title"
        >
          <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-3xl max-w-lg w-full p-6 shadow-[6px_6px_0px_#2A2623] space-y-4">
            <div className="flex items-center justify-between">
              <h3
                id="import-dialog-title"
                className="font-display text-xl font-bold text-[#2A2623]"
              >
                Import Plyli Backup JSON
              </h3>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                aria-label="Close import dialog"
                className="p-1.5 rounded-lg hover:bg-[#EFE9DE] text-[#6E655E] hover:text-[#2A2623]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#6E655E]">
              Upload a previously exported <code className="font-mono">.json</code> file or
              paste its contents below to restore forms and responses.
            </p>

            <div>
              <label
                htmlFor="json-file-upload"
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl cursor-pointer hover:bg-[#EFE9DE]"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose .json file</span>
              </label>
              <input
                id="json-file-upload"
                type="file"
                accept="application/json,.json"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </div>

            <div>
              <label htmlFor="json-paste-area" className="sr-only">
                JSON Backup Content
              </label>
              <textarea
                id="json-paste-area"
                rows={6}
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  setImportError(null);
                }}
                placeholder='{"schemaVersion": 1, "forms": [...], "responses": [...]}'
                className="w-full p-3 font-mono text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
              />
            </div>

            {importError && (
              <p className="text-xs font-semibold text-[#D4573B] bg-[#FDECE8] border border-[#2A2623] rounded-xl px-3 py-2">
                {importError}
              </p>
            )}

            {importSuccess && (
              <p className="text-xs font-semibold text-[#2A2623] bg-[#C5DFC9] border border-[#2A2623] rounded-xl px-3 py-2">
                {persistenceMode === 'account' ? 'Forms imported.' : 'Forms imported on this device.'}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <PaperButton
                variant="ivory"
                size="sm"
                onClick={() => setIsImportModalOpen(false)}
              >
                <span>Cancel</span>
              </PaperButton>
              <PaperButton
                variant="coral"
                size="sm"
                onClick={handleConfirmImport}
                disabled={!importText.trim()}
              >
                <Check className="w-4 h-4" />
                <span>Restore Backup</span>
              </PaperButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
