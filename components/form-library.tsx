'use client';

import React, { useRef, useState } from 'react';
import {
  FormSchema,
  FormResponseRecord,
  FORM_TEMPLATES,
  TemplateDefinition,
  createBlankForm,
} from '@/lib/form-engine';
import {
  PaperButton,
  SketchEmptyFolderGraphic,
} from './paper-primitives';
import {
  Plus,
  Play,
  Pencil,
  Files,
  Share2,
  Ellipsis,
  Trash2,
  GitBranch,
  Palette,
  MessageSquareText,
  Download,
  Upload,
  ChevronDown,
  Search,
  Sparkles,
  Check,
  X,
  RotateCcw,
  FileJson,
  GripVertical,
} from 'lucide-react';
import { resolveFormAppearance } from '@/themes/appearance-registry';
import { JsonImportDialog, type JsonImportResult } from './json-import-dialog';

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
  onImportBackup?: (rawJson: string) => JsonImportResult | Promise<JsonImportResult>;
  onCreateFromJson?: (rawJson: string) => Promise<JsonImportResult>;
  onRestoreStarterForms: () => void;
  persistenceMode?: 'local' | 'account';
  responseCounts?: Record<string, number>;
  publishedIds?: ReadonlySet<string>;
  onShareForm?: (formId: string) => void;
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
  onCreateFromJson,
  onRestoreStarterForms,
  persistenceMode = 'local',
  responseCounts,
  publishedIds,
  onShareForm,
}: FormLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sort, setSort] = useState(persistenceMode === 'account' ? 'updated' : 'workspace');
  const [allTemplates, setAllTemplates] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameDesc, setRenameDesc] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importKind, setImportKind] = useState<'form' | 'backup' | null>(null);
  const newFormMenu = useRef<HTMLDetailsElement>(null);
  const [draggedFormIdx, setDraggedFormIdx] = useState<number | null>(null);
  const [dropTargetFormIdx, setDropTargetFormIdx] = useState<number | null>(null);

  const canReorderCards =
    Boolean(onReorderForms) && sort === 'workspace' &&
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
    if (activeFilter === 'published') return publishedIds?.has(form.id);
    if (activeFilter === 'draft') return !publishedIds?.has(form.id);
    return true;
  });
  if (sort === 'updated') filteredForms.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (sort === 'title') filteredForms.sort((a, b) => a.title.localeCompare(b.title));

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
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2623]/15 pb-4">
        <div>
          <h1 id="library-heading" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Your Form Workspace</h1>
          <p className="mt-1 text-sm text-[#6E655E]">Build, share, and review your forms.</p>
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${onCreateFromJson ? 'ml-auto' : ''}`}>
          {onCreateFromJson ? (
            <details ref={newFormMenu} className="relative" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
            }} onKeyDown={(event) => {
              if (event.key !== 'Escape' || !event.currentTarget.open) return;
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }}>
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border-2 border-[#2A2623] bg-[#E86D52] px-4 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_#2A2623] hover:bg-[#DF6044] focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
                <Plus size={16} />New form<ChevronDown size={15} aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 grid w-44 gap-1 rounded-xl border border-[#2A2623] bg-[#FFFDF9] p-1 shadow-[2px_2px_0_#2A2623]">
                <PaperButton size="sm" variant="ghost" className="justify-start" onClick={() => { newFormMenu.current?.removeAttribute('open'); onCreateBlankForm(); }}>
                  <Plus size={14} />Blank form
                </PaperButton>
                <PaperButton size="sm" variant="ghost" className="justify-start" onClick={() => {
                  newFormMenu.current?.querySelector('summary')?.focus();
                  newFormMenu.current?.removeAttribute('open');
                  setImportKind('form');
                }}><FileJson size={14} />Paste form JSON</PaperButton>
              </div>
            </details>
          ) : <PaperButton variant="coral" onClick={onCreateBlankForm}><Plus size={16} />New form</PaperButton>}
          {onImportBackup && <>
            <PaperButton variant="ghost" onClick={() => setImportKind('backup')}><Upload size={16} />Import</PaperButton>
            <PaperButton variant="ghost" onClick={() => onExportBackup()}><Download size={16} />Export backup</PaperButton>
          </>}
        </div>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <section aria-labelledby="library-heading" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-48 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-[#6E655E]" />
            <input aria-label="Search forms" placeholder="Search forms…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full rounded-xl border border-[#2A2623]/50 bg-[#FFFDF9] py-2 pl-9 pr-3 text-sm" />
          </label>
          <select aria-label="Filter forms" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="rounded-xl border border-[#2A2623]/50 bg-[#FFFDF9] px-3 py-2 text-sm">
            <option value="all">All forms</option>
            {publishedIds && <><option value="published">Published</option><option value="draft">Drafts</option></>}
            <option value="responses">With responses</option><option value="branching">With branching</option>
          </select>
          <select aria-label="Sort forms" value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-xl border border-[#2A2623]/50 bg-[#FFFDF9] px-3 py-2 text-sm">
            {onReorderForms && <option value="workspace">Workspace order</option>}
            <option value="updated">Recently updated</option><option value="title">Name A–Z</option>
          </select>
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
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr))]">
            {filteredForms.map((form, cardIdx) => {
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
                  className={`flex min-w-0 flex-col justify-between bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl overflow-visible shadow-[4px_4px_0px_#2A2623] transition-all ${
                    isDraggingCard ? 'opacity-45 scale-[0.98]' : ''
                  } ${
                    isDropTargetCard ? 'ring-4 ring-[#E86D52]' : ''
                  }`}
                >
                  <div>
                    <div
                      className="h-3 rounded-t-[14px] border-b-2 border-[#2A2623]"
                      style={{ backgroundColor: activeTokens.primaryColor }}
                    />

                    <div className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6E655E]">
                          {canReorderCards && (
                            <span
                              title="Drag card to reorder in workspace"
                              aria-hidden="true"
                              className="text-[#9C9288] hover:text-[#2A2623] cursor-grab active:cursor-grabbing -ml-1"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {publishedIds && <span className={'rounded-md px-1.5 py-0.5 font-semibold ' + (publishedIds.has(form.id) ? 'bg-[#C5DFC9]/60' : 'bg-[#F6D97A]/30')}>{publishedIds.has(form.id) ? 'Published' : 'Draft'}</span>}
                          <span className="whitespace-nowrap">Updated {formatDate(form.updatedAt)}</span>
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
                              className="max-w-full text-left [overflow-wrap:anywhere] hover:text-[#D4573B] transition-colors cursor-pointer"
                            >
                              {form.title}
                            </button>
                          </h3>
                          <p className="text-sm text-[#6E655E] line-clamp-2 leading-relaxed [overflow-wrap:anywhere]">
                            {form.description || 'No description added yet.'}
                          </p>
                        </>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1.5 text-xs font-semibold text-[#6E655E]">
                        <span className="whitespace-nowrap tabular-nums">{form.questions.length} {form.questions.length === 1 ? 'question' : 'questions'}</span>
                        <button type="button" onClick={() => onOpenForm(form.id, 'responses')} className="inline-flex items-center gap-1.5 whitespace-nowrap underline decoration-dashed underline-offset-4 hover:text-[#2A2623]"><MessageSquareText size={14} className="text-[#D4573B]" />{responseCount} {responseCount === 1 ? 'response' : 'responses'}</button>
                        <button type="button" onClick={() => onOpenForm(form.id, 'flow')} className="inline-flex cursor-pointer items-center gap-1.5 underline decoration-dashed underline-offset-4 hover:text-[#2A2623]"><GitBranch size={14} className="text-[#D4573B]" />{branchCount} {branchCount === 1 ? 'flow rule' : 'flow rules'}</button>
                        <button type="button" onClick={() => onOpenForm(form.id, 'design')} className="inline-flex cursor-pointer items-center gap-1.5 underline decoration-dashed underline-offset-4 hover:text-[#2A2623]"><Palette size={14} className="text-[#D4573B]" />{activeTokens.templateName} Theme</button>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3.5 bg-[#FAF6F0] border-t-2 border-[#2A2623] flex flex-wrap items-center gap-1.5 rounded-b-2xl">
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
                        <PaperButton variant="coral" size="sm" onClick={() => onOpenForm(form.id, 'build')} aria-label={'Edit ' + form.title}>Edit</PaperButton>
                        {onShareForm
                          ? <PaperButton size="sm" onClick={() => onShareForm(form.id)}><Share2 size={14} />Share</PaperButton>
                          : <PaperButton variant="yellow" size="sm" onClick={() => onPreviewForm(form.id)}><Play size={13} />Preview</PaperButton>}
                        <details className="group relative ml-auto">
                          <summary aria-label={'More actions for ' + form.title} className="flex list-none cursor-pointer items-center rounded-lg px-2 py-2 hover:bg-[#EFE9DE] focus-visible:outline-2"><Ellipsis size={18} /></summary>
                          <div className="absolute right-0 z-20 mt-1 grid w-44 rounded-xl border border-[#2A2623] bg-[#FFFDF9] p-1 shadow-[2px_2px_0px_#2A2623] [&>button]:flex [&>button]:items-center [&>button]:gap-2 [&>button]:rounded-lg [&>button]:p-2 [&>button]:text-left [&>button]:text-xs [&>button:hover]:bg-[#FAF6F0]">
                            {onShareForm && <button type="button" onClick={() => onPreviewForm(form.id)}><Play size={14} />Preview</button>}
                            <button type="button" onClick={() => startRenaming(form)}><Pencil size={14} />Rename</button>
                            <button type="button" onClick={() => onDuplicateForm(form.id)}><Files size={14} />Duplicate form</button>
                            <button type="button" onClick={() => onExportBackup(form.id)}><FileJson size={14} />Export backup</button>
                            <button type="button" onClick={() => setDeletingId(form.id)}><Trash2 size={14} />{persistenceMode === 'account' ? 'Archive form' : 'Delete form'}</button>
                          </div>
                        </details>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <aside aria-labelledby="templates-heading" className="rounded-2xl border border-[#2A2623]/35 bg-[#FFFDF9] p-4">
        <h2 id="templates-heading" className="font-display text-xl font-bold">Templates</h2>
        <p className="mt-1 text-xs text-[#6E655E]">Start with ready-made questions and branching.</p>
        <div className="mt-3 divide-y divide-[#2A2623]/15">
          {FORM_TEMPLATES.slice(0, allTemplates ? undefined : 2).map((template) => (
            <button key={template.id} type="button" onClick={() => onCreateFromTemplate(template)} className="flex w-full items-start gap-2.5 py-3 text-left hover:text-[#D4573B] focus-visible:outline-2">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-[#D4573B]" />
              <span><span className="block text-sm font-bold">{template.name}</span><span className="mt-0.5 block text-xs text-[#6E655E]">{allTemplates ? template.tagline : template.questionCount + ' questions'}</span></span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAllTemplates(!allTemplates)} aria-expanded={allTemplates} className="mt-2 text-xs font-semibold underline underline-offset-4">{allTemplates ? 'Show featured templates' : 'Browse all templates'}</button>
      </aside>
      </div>

      {importKind === 'form' && onCreateFromJson && (
        <JsonImportDialog kind="form" onClose={() => setImportKind(null)} onImport={onCreateFromJson}
          getExample={() => JSON.stringify(createBlankForm(), null, 2)} />
      )}
      {importKind === 'backup' && onImportBackup && (
        <JsonImportDialog kind="backup" onClose={() => setImportKind(null)} onImport={onImportBackup} />
      )}
    </div>
  );
}
