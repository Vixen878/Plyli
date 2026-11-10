'use client';

import React, { useState, useRef } from 'react';
import {
  FormSchema,
  FormQuestion,
  QuestionType,
  QUESTION_TYPE_META,
  AnswerValue,
  RecordChangeOptions,
  createDefaultQuestion,
  removeQuestionAndCleanReferences,
  updateQuestionChoicesAndSyncRules,
  reorderQuestions,
  reorderQuestionChoices,
  generateId,
} from '@/lib/form-engine';
import {
  PaperButton,
  THEME_PALETTE,
  AccentTheme,
} from './paper-primitives';
import {
  resolveFormAppearance,
  getBackgroundTreatmentStyle,
} from '@/themes/appearance-registry';
import {
  ThemedFormCard,
  ThemedWelcomeScreen,
  ThemedCompletionBadge,
} from './themed-form-surface';
import { QuestionRenderer, ThemedActionButton } from './question-renderer';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  GitBranch,
  Sparkles,
  CheckCircle2,
  Smartphone,
  Monitor,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Palette,
  GripVertical,
} from 'lucide-react';

export type SelectedBuilderNode =
  | { kind: 'welcome' }
  | { kind: 'question'; questionId: string }
  | { kind: 'completion' };

interface FormBuilderProps {
  form: FormSchema;
  selectedNode: SelectedBuilderNode;
  onSelectNode: (node: SelectedBuilderNode) => void;
  onUpdateForm: (
    updater: (prev: FormSchema) => FormSchema,
    options?: RecordChangeOptions
  ) => void;
  onSwitchToFlow: (questionId?: string) => void;
  onSwitchToDesign?: () => void;
  onLaunchPreview: () => void;
}

const ALL_QUESTION_TYPES: QuestionType[] = [
  'short_text',
  'long_text',
  'email',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'yes_no',
  'rating',
  'number',
  'date',
];

export function FormBuilder({
  form,
  selectedNode,
  onSelectNode,
  onUpdateForm,
  onSwitchToFlow,
  onSwitchToDesign,
  onLaunchPreview,
}: FormBuilderProps) {
  const [showAddTypePicker, setShowAddTypePicker] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, AnswerValue>>({});
  const [stageViewport, setStageViewport] = useState<'desktop' | 'mobile'>('desktop');

  // Drag-and-drop state for Questions list
  const [draggedQuestionIdx, setDraggedQuestionIdx] = useState<number | null>(null);
  const [dropTargetQuestionIdx, setDropTargetQuestionIdx] = useState<number | null>(
    null
  );
  const questionListScrollRef = useRef<HTMLDivElement | null>(null);

  // Drag-and-drop state for Answer Choices list
  const [draggedChoiceIdx, setDraggedChoiceIdx] = useState<number | null>(null);
  const [dropTargetChoiceIdx, setDropTargetChoiceIdx] = useState<number | null>(
    null
  );

  const activeQuestionIndex =
    selectedNode.kind === 'question'
      ? form.questions.findIndex((q) => q.id === selectedNode.questionId)
      : -1;

  const activeQuestion: FormQuestion | undefined =
    activeQuestionIndex >= 0 ? form.questions[activeQuestionIndex] : undefined;

  const activeTokens = resolveFormAppearance(form.appearance, form.accentTheme);

  const handleAddQuestion = (type: QuestionType) => {
    const newQ = createDefaultQuestion(type, form.questions.length + 1);
    onUpdateForm(
      (prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        questionOrder: [...prev.questions.map((q) => q.id), newQ.id],
        questions: [...prev.questions, newQ],
      }),
      { label: `Add ${QUESTION_TYPE_META[type].label} question` }
    );
    onSelectNode({ kind: 'question', questionId: newQ.id });
    setShowAddTypePicker(false);
  };

  const handleUpdateQuestion = (
    questionId: string,
    updates: Partial<FormQuestion>,
    options?: RecordChangeOptions
  ) => {
    // Infer a concise label and coalesceKey for text edits if not explicitly provided
    let inferredOptions = options;
    if (!inferredOptions) {
      if ('title' in updates && Object.keys(updates).length === 1) {
        inferredOptions = {
          label: 'Edit question prompt',
          coalesceKey: `q-title-${questionId}`,
        };
      } else if ('description' in updates && Object.keys(updates).length === 1) {
        inferredOptions = {
          label: 'Edit question description',
          coalesceKey: `q-desc-${questionId}`,
        };
      } else if ('placeholder' in updates && Object.keys(updates).length === 1) {
        inferredOptions = {
          label: 'Edit placeholder',
          coalesceKey: `q-placeholder-${questionId}`,
        };
      } else if ('type' in updates) {
        inferredOptions = { label: 'Change question type' };
      } else if ('required' in updates) {
        inferredOptions = { label: 'Toggle required answer' };
      } else {
        inferredOptions = { label: 'Update question settings' };
      }
    }

    onUpdateForm((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      questions: prev.questions.map((q) => {
        if (q.id !== questionId) return q;
        const next = { ...q, ...updates };
        // Ensure choices exist when switching to a choice-based type
        if (
          (next.type === 'single_choice' ||
            next.type === 'multiple_choice' ||
            next.type === 'dropdown') &&
          (!next.choices || next.choices.length === 0)
        ) {
          next.choices = [
            { id: generateId('opt'), label: 'Option A' },
            { id: generateId('opt'), label: 'Option B' },
            { id: generateId('opt'), label: 'Option C' },
          ];
        }
        if (next.type === 'yes_no') {
          next.choices = [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ];
        }
        if (next.type === 'rating' && !next.maxRating) {
          next.maxRating = 5;
        }
        return next;
      }),
    }), inferredOptions);
  };

  const handleReorderQuestion = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= form.questions.length ||
      toIndex < 0 ||
      toIndex >= form.questions.length
    ) {
      return;
    }
    onUpdateForm((prev) => reorderQuestions(prev, fromIndex, toIndex), {
      label: 'Reorder questions',
    });
  };

  const handleMoveQuestion = (index: number, direction: -1 | 1) => {
    handleReorderQuestion(index, index + direction);
  };

  const handleReorderChoice = (fromIndex: number, toIndex: number) => {
    if (!activeQuestion) return;
    const reordered = reorderQuestionChoices(activeQuestion, fromIndex, toIndex);
    if (reordered === activeQuestion) return;
    handleUpdateQuestion(
      activeQuestion.id,
      {
        choices: reordered.choices,
        logicRules: reordered.logicRules,
      },
      { label: 'Reorder choices' }
    );
  };

  const handleDuplicateQuestion = (question: FormQuestion, index: number) => {
    const duplicated: FormQuestion = {
      ...question,
      id: generateId('q'),
      title: `${question.title} (Copy)`,
      choices: question.choices?.map((c) => ({ ...c, id: generateId('opt') })),
      logicRules: [],
    };
    onUpdateForm(
      (prev) => {
        const copy = [...prev.questions];
        copy.splice(index + 1, 0, duplicated);
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          questionOrder: copy.map((q) => q.id),
          questions: copy,
        };
      },
      { label: 'Duplicate question' }
    );
    onSelectNode({ kind: 'question', questionId: duplicated.id });
  };

  const handleDeleteQuestion = (questionId: string) => {
    if (form.questions.length <= 1) return;
    const idx = form.questions.findIndex((q) => q.id === questionId);
    const cleanedForm = removeQuestionAndCleanReferences(form, questionId);
    onUpdateForm((prev) => removeQuestionAndCleanReferences(prev, questionId), {
      label: 'Delete question',
    });
    const fallbackQ = cleanedForm.questions[Math.max(0, idx - 1)];
    if (fallbackQ) {
      onSelectNode({ kind: 'question', questionId: fallbackQ.id });
    } else {
      onSelectNode({ kind: 'welcome' });
    }
  };

  const stepBackward = () => {
    if (selectedNode.kind === 'completion') {
      if (form.questions.length > 0) {
        onSelectNode({
          kind: 'question',
          questionId: form.questions[form.questions.length - 1].id,
        });
      } else {
        onSelectNode({ kind: 'welcome' });
      }
    } else if (selectedNode.kind === 'question') {
      if (activeQuestionIndex > 0) {
        onSelectNode({
          kind: 'question',
          questionId: form.questions[activeQuestionIndex - 1].id,
        });
      } else {
        onSelectNode({ kind: 'welcome' });
      }
    }
  };

  const stepForward = () => {
    if (selectedNode.kind === 'welcome') {
      if (form.questions.length > 0) {
        onSelectNode({ kind: 'question', questionId: form.questions[0].id });
      } else {
        onSelectNode({ kind: 'completion' });
      }
    } else if (selectedNode.kind === 'question') {
      if (activeQuestionIndex < form.questions.length - 1) {
        onSelectNode({
          kind: 'question',
          questionId: form.questions[activeQuestionIndex + 1].id,
        });
      } else {
        onSelectNode({ kind: 'completion' });
      }
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside
          aria-label="Form structure navigation"
          className="lg:col-span-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[3px_3px_0px_#2A2623] space-y-4"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-[#6E655E] px-1">
              <span>Opening Screen</span>
              <span>{form.welcomeScreen.enabled ? 'Active' : 'Hidden'}</span>
            </div>
            <button
              type="button"
              onClick={() => onSelectNode({ kind: 'welcome' })}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                selectedNode.kind === 'welcome'
                  ? 'bg-[#F6D97A] border-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                  : 'bg-[#FAF6F0] border-[#2A2623]/30 hover:border-[#2A2623]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="w-4 h-4 text-[#E86D52] shrink-0" />
                <span className="text-xs font-bold text-[#2A2623] truncate">
                  {form.welcomeScreen.title || 'Welcome Screen'}
                </span>
              </div>
            </button>
          </div>
          <div className="space-y-2 border-t border-[#2A2623]/15 pt-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#6E655E]">
                Questions ({form.questions.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddTypePicker((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#D4573B] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </div>

            <div
              ref={questionListScrollRef}
              className="space-y-2 max-h-[380px] overflow-y-auto pr-1"
            >
              {form.questions.map((q, idx) => {
                const isSelected =
                  selectedNode.kind === 'question' &&
                  selectedNode.questionId === q.id;
                const meta = QUESTION_TYPE_META[q.type];
                const hasLogic = q.logicRules && q.logicRules.length > 0;
                const isDragging = draggedQuestionIdx === idx;
                const isDropTarget =
                  dropTargetQuestionIdx === idx &&
                  draggedQuestionIdx !== null &&
                  draggedQuestionIdx !== idx;

                return (
                  <div
                    key={q.id}
                    data-testid={`builder-question-item-${idx}`}
                    draggable={form.questions.length > 1}
                    onDragStart={(e) => {
                      setDraggedQuestionIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dropTargetQuestionIdx !== idx) {
                        setDropTargetQuestionIdx(idx);
                      }
                      // Auto-scroll container when dragging near top or bottom edge
                      const container = questionListScrollRef.current;
                      if (container) {
                        const rect = container.getBoundingClientRect();
                        if (e.clientY - rect.top < 36) {
                          container.scrollTop -= 8;
                        } else if (rect.bottom - e.clientY < 36) {
                          container.scrollTop += 8;
                        }
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx =
                        draggedQuestionIdx ??
                        Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
                      setDraggedQuestionIdx(null);
                      setDropTargetQuestionIdx(null);
                      if (Number.isFinite(fromIdx) && fromIdx !== idx) {
                        handleReorderQuestion(fromIdx, idx);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedQuestionIdx(null);
                      setDropTargetQuestionIdx(null);
                    }}
                    className={`group rounded-xl border-2 transition-all ${
                      isDragging
                        ? 'opacity-45 border-dashed border-[#E86D52] bg-[#FFF9EB]'
                        : isSelected
                          ? 'bg-[#FFF9EB] border-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                          : 'bg-[#FAF6F0] border-[#2A2623]/25 hover:border-[#2A2623]'
                    } ${
                      isDropTarget
                        ? draggedQuestionIdx !== null && draggedQuestionIdx < idx
                          ? 'border-b-4 border-b-[#E86D52]'
                          : 'border-t-4 border-t-[#E86D52]'
                        : ''
                    }`}
                  >
                    <div className="flex items-stretch">
                      <div
                        title="Drag to reorder question"
                        aria-hidden="true"
                        className="pl-2 pr-0.5 flex items-center text-[#9C9288] group-hover:text-[#2A2623] cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectNode({ kind: 'question', questionId: q.id })
                        }
                        className="flex-1 p-2.5 pl-1.5 text-left flex items-start gap-2.5 cursor-pointer min-w-0"
                      >
                        <span
                          className="px-1.5 py-0.5 rounded-md border border-[#2A2623] font-mono text-[11px] font-bold text-[#2A2623] shrink-0 tabular-nums"
                          style={{ backgroundColor: meta.badgeBg }}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#2A2623] truncate">
                            {q.title}
                          </p>
                          <p className="text-[11px] text-[#6E655E] flex items-center gap-1.5 mt-0.5">
                            <span>{meta.shortLabel}</span>
                            {q.required && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#D4573B] font-semibold">
                                  Req
                                </span>
                              </>
                            )}
                            {hasLogic && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-0.5 text-[#2A2623] font-semibold">
                                  <GitBranch className="w-3 h-3 text-[#E86D52]" />
                                  {q.logicRules.length}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </button>
                    </div>
                    {isSelected && (
                      <div className="px-2.5 pb-2 pt-1 border-t border-[#2A2623]/10 flex items-center justify-between text-[#6E655E]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveQuestion(idx, -1)}
                            disabled={idx === 0}
                            aria-label={`Move question ${idx + 1} up`}
                            title="Move up"
                            className="p-1 rounded hover:bg-[#EFE9DE] hover:text-[#2A2623] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveQuestion(idx, 1)}
                            disabled={idx === form.questions.length - 1}
                            aria-label={`Move question ${idx + 1} down`}
                            title="Move down"
                            className="p-1 rounded hover:bg-[#EFE9DE] hover:text-[#2A2623] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateQuestion(q, idx)}
                            aria-label={`Duplicate question ${idx + 1}`}
                            title="Duplicate question"
                            className="p-1 rounded hover:bg-[#EFE9DE] hover:text-[#2A2623] cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            disabled={form.questions.length <= 1}
                            aria-label={`Delete question ${idx + 1}`}
                            title="Delete question"
                            className="p-1 rounded hover:bg-[#FDECE8] hover:text-[#D4573B] disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="pt-1">
              <PaperButton
                variant="ivory"
                size="sm"
                className="w-full"
                onClick={() => setShowAddTypePicker((v) => !v)}
              >
                <Plus className="w-4 h-4 text-[#E86D52]" />
                <span>Add New Question</span>
              </PaperButton>

              {showAddTypePicker && (
                <div className="mt-2 p-2.5 bg-[#FAF6F0] border-2 border-[#2A2623] rounded-2xl space-y-1.5">
                  <p className="text-[11px] font-bold text-[#6E655E] px-1">
                    Choose a question type:
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_QUESTION_TYPES.map((t) => {
                      const info = QUESTION_TYPE_META[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleAddQuestion(t)}
                          className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#FFFDF9] border border-[#2A2623] hover:bg-[#F6D97A] text-left text-xs font-semibold text-[#2A2623] transition-colors cursor-pointer"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-[#2A2623] shrink-0"
                            style={{ backgroundColor: info.badgeBg }}
                          />
                          <span className="truncate">{info.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1.5 border-t border-[#2A2623]/15 pt-3">
            <div className="flex items-center justify-between text-xs font-bold text-[#6E655E] px-1">
              <span>Ending Screen</span>
              <span>Always On</span>
            </div>
            <button
              type="button"
              onClick={() => onSelectNode({ kind: 'completion' })}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                selectedNode.kind === 'completion'
                  ? 'bg-[#C5DFC9] border-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                  : 'bg-[#FAF6F0] border-[#2A2623]/30 hover:border-[#2A2623]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-[#2A2623] shrink-0" />
                <span className="text-xs font-bold text-[#2A2623] truncate">
                  {form.completionScreen.title || 'Completion Screen'}
                </span>
              </div>
            </button>
          </div>
        </aside>
        <section
          aria-label="Interactive stage preview"
          className="lg:col-span-5 xl:col-span-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl px-4 py-2.5 shadow-[3px_3px_0px_#2A2623]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={stepBackward}
                disabled={selectedNode.kind === 'welcome'}
                aria-label="Previous step in builder"
                className="p-1.5 rounded-lg border border-[#2A2623] bg-[#FAF6F0] hover:bg-[#EFE9DE] disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-[#2A2623] tabular-nums">
                {selectedNode.kind === 'welcome'
                  ? 'Welcome Screen'
                  : selectedNode.kind === 'completion'
                  ? 'Completion Screen'
                  : `Question ${activeQuestionIndex + 1} of ${form.questions.length}`}
              </span>
              <button
                type="button"
                onClick={stepForward}
                disabled={selectedNode.kind === 'completion'}
                aria-label="Next step in builder"
                className="p-1.5 rounded-lg border border-[#2A2623] bg-[#FAF6F0] hover:bg-[#EFE9DE] disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onSwitchToDesign && (
                <button
                  type="button"
                  onClick={onSwitchToDesign}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623] hover:bg-[#F6D97A] transition-colors cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5 text-[#E86D52]" />
                  <span>Theme: {activeTokens.templateName}</span>
                </button>
              )}

              <div
                className="flex items-center gap-1 p-1 bg-[#FAF6F0] border border-[#2A2623] rounded-xl"
                role="group"
                aria-label="Stage viewport size"
              >
                <button
                  type="button"
                  onClick={() => setStageViewport('desktop')}
                  aria-label="Desktop card view"
                  className={`p-1.5 rounded-lg text-xs cursor-pointer ${
                    stageViewport === 'desktop'
                      ? 'bg-[#2A2623] text-white'
                      : 'text-[#6E655E] hover:text-[#2A2623]'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setStageViewport('mobile')}
                  aria-label="Mobile card view"
                  className={`p-1.5 rounded-lg text-xs cursor-pointer ${
                    stageViewport === 'mobile'
                      ? 'bg-[#2A2623] text-white'
                      : 'text-[#6E655E] hover:text-[#2A2623]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div
            style={
              activeTokens.templateId !== 'paper' ||
              form.appearance?.overrides?.backgroundColor ||
              form.appearance?.overrides?.backgroundTreatment
                ? getBackgroundTreatmentStyle(activeTokens)
                : undefined
            }
            className={`mx-auto transition-all ${
              activeTokens.templateId !== 'paper' ||
              form.appearance?.overrides?.backgroundColor ||
              form.appearance?.overrides?.backgroundTreatment
                ? 'p-4 sm:p-6 rounded-3xl border-2 border-[#2A2623]'
                : ''
            }`}
          >
            <div
              className={`mx-auto transition-all ${
                stageViewport === 'mobile' ? 'max-w-[380px]' : 'w-full'
              }`}
            >
              <ThemedFormCard
                appearance={activeTokens}
                footer={
                  <>
                    <span>
                      Tip: Click any heading on the card to edit inline, or interact
                      with the controls to test how it feels.
                    </span>
                    {activeQuestion && (
                      <button
                        type="button"
                        onClick={() => onSwitchToFlow(activeQuestion.id)}
                        style={{ color: activeTokens.textColor }}
                        className="inline-flex items-center gap-1 font-bold hover:opacity-80 cursor-pointer"
                      >
                        <GitBranch
                          className="w-3.5 h-3.5"
                          style={{ color: activeTokens.primaryColor }}
                        />
                        <span>Edit Branching Flow</span>
                      </button>
                    )}
                  </>
                }
              >
                <div className="min-h-[340px] flex flex-col justify-center">
                  {selectedNode.kind === 'welcome' && (
                    <ThemedWelcomeScreen
                      appearance={activeTokens}
                      title={form.welcomeScreen.title}
                      description={form.welcomeScreen.description}
                      buttonText={form.welcomeScreen.buttonText}
                      timeEstimate={form.welcomeScreen.timeEstimate}
                      questionCount={form.questions.length}
                      enabled={form.welcomeScreen.enabled}
                      editableInline={true}
                      onTitleChange={(val) =>
                        onUpdateForm(
                          (prev) => ({
                            ...prev,
                            welcomeScreen: {
                              ...prev.welcomeScreen,
                              title: val,
                            },
                          }),
                          { label: 'Edit welcome title', coalesceKey: 'welcome-title' }
                        )
                      }
                      onDescriptionChange={(val) =>
                        onUpdateForm(
                          (prev) => ({
                            ...prev,
                            welcomeScreen: {
                              ...prev.welcomeScreen,
                              description: val,
                            },
                          }),
                          {
                            label: 'Edit welcome description',
                            coalesceKey: 'welcome-desc',
                          }
                        )
                      }
                      onStart={stepForward}
                    />
                  )}

                  {selectedNode.kind === 'question' && activeQuestion && (
                    <QuestionRenderer
                      question={activeQuestion}
                      stepNumber={activeQuestionIndex + 1}
                      totalSteps={form.questions.length}
                      value={previewAnswers[activeQuestion.id]}
                      onChange={(val) =>
                        setPreviewAnswers((prev) => ({
                          ...prev,
                          [activeQuestion.id]: val,
                        }))
                      }
                      onSubmitStep={stepForward}
                      editableInline={true}
                      onInlineUpdate={(updates) =>
                        handleUpdateQuestion(activeQuestion.id, updates)
                      }
                      submitLabel="Next Question"
                      appearance={activeTokens}
                    />
                  )}

                  {selectedNode.kind === 'completion' && (
                    <div
                      className="text-center space-y-5 max-w-lg mx-auto py-4"
                      style={{
                        color: activeTokens.textColor,
                        fontFamily: activeTokens.bodyFontCss,
                      }}
                    >
                      <div className="flex justify-center">
                        <ThemedCompletionBadge appearance={activeTokens} />
                      </div>

                      <div>
                        <label
                          htmlFor="stage-completion-title"
                          className="sr-only"
                        >
                          Completion Title
                        </label>
                        <input
                          id="stage-completion-title"
                          type="text"
                          value={form.completionScreen.title}
                          onChange={(e) =>
                            onUpdateForm(
                              (prev) => ({
                                ...prev,
                                completionScreen: {
                                  ...prev.completionScreen,
                                  title: e.target.value,
                                },
                              }),
                              {
                                label: 'Edit completion title',
                                coalesceKey: 'comp-title',
                              }
                            )
                          }
                          style={{
                            fontFamily: activeTokens.headingFontCss,
                            color: activeTokens.textColor,
                          }}
                          className="w-full text-center text-2xl sm:text-3xl font-extrabold bg-transparent border-b-2 border-dashed border-transparent hover:border-current/30 focus:border-current focus:outline-none py-1"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="stage-completion-desc"
                          className="sr-only"
                        >
                          Completion Description
                        </label>
                        <textarea
                          id="stage-completion-desc"
                          rows={2}
                          value={form.completionScreen.description}
                          onChange={(e) =>
                            onUpdateForm(
                              (prev) => ({
                                ...prev,
                                completionScreen: {
                                  ...prev.completionScreen,
                                  description: e.target.value,
                                },
                              }),
                              {
                                label: 'Edit completion description',
                                coalesceKey: 'comp-desc',
                              }
                            )
                          }
                          style={{ color: activeTokens.mutedTextColor }}
                          className="w-full text-center text-sm sm:text-base bg-transparent border-b border-dashed border-transparent hover:border-current/25 focus:border-current focus:outline-none py-1 resize-none"
                        />
                      </div>

                      <div className="pt-2 flex justify-center">
                        <ThemedActionButton
                          appearance={activeTokens}
                          variant="primary"
                          size="md"
                          onClick={onLaunchPreview}
                        >
                          <span>{form.completionScreen.buttonText || 'Done'}</span>
                        </ThemedActionButton>
                      </div>
                    </div>
                  )}
                </div>
              </ThemedFormCard>
            </div>
          </div>
        </section>
        <aside
          aria-label="Selected item settings"
          className="lg:col-span-4 xl:col-span-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-5"
        >
          <div className="flex items-center justify-between border-b border-[#2A2623]/15 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#E86D52]" />
              <h3 className="font-display text-base font-bold text-[#2A2623]">
                {selectedNode.kind === 'welcome'
                  ? 'Welcome Settings'
                  : selectedNode.kind === 'completion'
                  ? 'Completion Settings'
                  : 'Question Settings'}
              </h3>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Form accent color">
              {(['coral', 'yellow', 'blue', 'pink', 'sage'] as AccentTheme[]).map(
                (themeKey) => (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() =>
                      onUpdateForm((prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        accentTheme: themeKey,
                      }))
                    }
                    title={`Theme: ${THEME_PALETTE[themeKey].name}`}
                    aria-label={`Set theme to ${THEME_PALETTE[themeKey].name}`}
                    className={`w-5 h-5 rounded-full border-2 border-[#2A2623] transition-transform cursor-pointer ${
                      form.accentTheme === themeKey ? 'scale-125' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: THEME_PALETTE[themeKey].bg }}
                  />
                )
              )}
            </div>
          </div>
          {selectedNode.kind === 'welcome' && (
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-[#2A2623]">
                    Show Welcome Screen
                  </p>
                  <p className="text-[11px] text-[#6E655E]">
                    Greet respondents before Question 1
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.welcomeScreen.enabled}
                  onChange={(e) =>
                    onUpdateForm((prev) => ({
                      ...prev,
                      updatedAt: new Date().toISOString(),
                      welcomeScreen: {
                        ...prev.welcomeScreen,
                        enabled: e.target.checked,
                      },
                    }))
                  }
                  className="w-4 h-4 accent-[#E86D52]"
                />
              </label>

              <div>
                <label
                  htmlFor="inspector-welcome-title"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Headline
                </label>
                <input
                  id="inspector-welcome-title"
                  type="text"
                  value={form.welcomeScreen.title}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        welcomeScreen: {
                          ...prev.welcomeScreen,
                          title: e.target.value,
                        },
                      }),
                      { label: 'Edit welcome title', coalesceKey: 'welcome-title' }
                    )
                  }
                  className="w-full px-3 py-2 text-sm bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="inspector-welcome-desc"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Intro Description
                </label>
                <textarea
                  id="inspector-welcome-desc"
                  rows={3}
                  value={form.welcomeScreen.description}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        welcomeScreen: {
                          ...prev.welcomeScreen,
                          description: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit welcome description',
                        coalesceKey: 'welcome-desc',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-sm bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="inspector-welcome-btn"
                    className="block text-xs font-bold text-[#2A2623] mb-1"
                  >
                    Button Label
                  </label>
                  <input
                    id="inspector-welcome-btn"
                    type="text"
                    value={form.welcomeScreen.buttonText}
                    onChange={(e) =>
                      onUpdateForm(
                        (prev) => ({
                          ...prev,
                          updatedAt: new Date().toISOString(),
                          welcomeScreen: {
                            ...prev.welcomeScreen,
                            buttonText: e.target.value,
                          },
                        }),
                        {
                          label: 'Edit welcome button',
                          coalesceKey: 'welcome-btn',
                        }
                      )
                    }
                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="inspector-welcome-time"
                    className="block text-xs font-bold text-[#2A2623] mb-1"
                  >
                    Time Estimate
                  </label>
                  <input
                    id="inspector-welcome-time"
                    type="text"
                    value={form.welcomeScreen.timeEstimate}
                    onChange={(e) =>
                      onUpdateForm(
                        (prev) => ({
                          ...prev,
                          updatedAt: new Date().toISOString(),
                          welcomeScreen: {
                            ...prev.welcomeScreen,
                            timeEstimate: e.target.value,
                          },
                        }),
                        {
                          label: 'Edit time estimate',
                          coalesceKey: 'welcome-time',
                        }
                      )
                    }
                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
          {selectedNode.kind === 'question' && activeQuestion && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="inspector-question-type"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Question Type
                </label>
                <select
                  id="inspector-question-type"
                  value={activeQuestion.type}
                  onChange={(e) =>
                    handleUpdateQuestion(activeQuestion.id, {
                      type: e.target.value as QuestionType,
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
                >
                  {ALL_QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-[#2A2623]">
                    Required Answer
                  </p>
                  <p className="text-[11px] text-[#6E655E]">
                    Prevent skipping without a valid response
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={activeQuestion.required}
                  onChange={(e) =>
                    handleUpdateQuestion(activeQuestion.id, {
                      required: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#E86D52]"
                />
              </label>
              <div>
                <label
                  htmlFor="inspector-q-title"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Question Prompt
                </label>
                <input
                  id="inspector-q-title"
                  type="text"
                  value={activeQuestion.title}
                  onChange={(e) =>
                    handleUpdateQuestion(activeQuestion.id, {
                      title: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="inspector-q-desc"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Description / Helper Note
                </label>
                <textarea
                  id="inspector-q-desc"
                  rows={2}
                  value={activeQuestion.description}
                  onChange={(e) =>
                    handleUpdateQuestion(activeQuestion.id, {
                      description: e.target.value,
                    })
                  }
                  placeholder="Optional guidance for respondents..."
                  className="w-full px-3 py-2 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none resize-none"
                />
              </div>
              {(activeQuestion.type === 'short_text' ||
                activeQuestion.type === 'long_text' ||
                activeQuestion.type === 'email' ||
                activeQuestion.type === 'number') && (
                <div>
                  <label
                    htmlFor="inspector-q-placeholder"
                    className="block text-xs font-bold text-[#2A2623] mb-1"
                  >
                    Input Placeholder
                  </label>
                  <input
                    id="inspector-q-placeholder"
                    type="text"
                    value={activeQuestion.placeholder || ''}
                    onChange={(e) =>
                      handleUpdateQuestion(activeQuestion.id, {
                        placeholder: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                  />
                </div>
              )}
              {(activeQuestion.type === 'short_text' ||
                activeQuestion.type === 'long_text') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="inspector-q-minlen"
                      className="block text-xs font-bold text-[#2A2623] mb-1"
                    >
                      Min Characters
                    </label>
                    <input
                      id="inspector-q-minlen"
                      type="number"
                      min={0}
                      value={
                        typeof activeQuestion.minLength === 'number'
                          ? activeQuestion.minLength
                          : ''
                      }
                      onChange={(e) =>
                        handleUpdateQuestion(activeQuestion.id, {
                          minLength:
                            e.target.value === ''
                              ? undefined
                              : Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="inspector-q-maxlen"
                      className="block text-xs font-bold text-[#2A2623] mb-1"
                    >
                      Max Characters
                    </label>
                    <input
                      id="inspector-q-maxlen"
                      type="number"
                      min={1}
                      value={
                        typeof activeQuestion.maxLength === 'number'
                          ? activeQuestion.maxLength
                          : ''
                      }
                      onChange={(e) =>
                        handleUpdateQuestion(activeQuestion.id, {
                          maxLength:
                            e.target.value === ''
                              ? undefined
                              : Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                    />
                  </div>
                </div>
              )}
              {activeQuestion.type === 'number' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="inspector-q-min"
                      className="block text-xs font-bold text-[#2A2623] mb-1"
                    >
                      Min Value
                    </label>
                    <input
                      id="inspector-q-min"
                      type="number"
                      value={
                        typeof activeQuestion.minNumber === 'number'
                          ? activeQuestion.minNumber
                          : ''
                      }
                      onChange={(e) =>
                        handleUpdateQuestion(activeQuestion.id, {
                          minNumber:
                            e.target.value === ''
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="inspector-q-max"
                      className="block text-xs font-bold text-[#2A2623] mb-1"
                    >
                      Max Value
                    </label>
                    <input
                      id="inspector-q-max"
                      type="number"
                      value={
                        typeof activeQuestion.maxNumber === 'number'
                          ? activeQuestion.maxNumber
                          : ''
                      }
                      onChange={(e) =>
                        handleUpdateQuestion(activeQuestion.id, {
                          maxNumber:
                            e.target.value === ''
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                    />
                  </div>
                </div>
              )}
              {activeQuestion.type === 'multiple_choice' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="inspector-q-minchoices"
                      className="block text-xs font-bold text-[#2A2623] mb-1"
                    >
                      Min Selections
                    </label>
                    <input
                      id="inspector-q-minchoices"
                      type="number"
                      min={0}
                      value={
                        typeof activeQuestion.minChoices === 'number'
                          ? activeQuestion.minChoices
                          : ''
                      }
                      onChange={(e) =>
                        handleUpdateQuestion(activeQuestion.id, {
                          minChoices:
                            e.target.value === ''
                              ? undefined
                              : Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="inspector-q-maxchoices"
                      className="block text-xs font-bold text-[#2A2623] mb-1"
                    >
                      Max Selections
                    </label>
                    <input
                      id="inspector-q-maxchoices"
                      type="number"
                      min={1}
                      value={
                        typeof activeQuestion.maxChoices === 'number'
                          ? activeQuestion.maxChoices
                          : ''
                      }
                      onChange={(e) =>
                        handleUpdateQuestion(activeQuestion.id, {
                          maxChoices:
                            e.target.value === ''
                              ? undefined
                              : Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                    />
                  </div>
                </div>
              )}
              {activeQuestion.type === 'rating' && (
                <div>
                  <span className="block text-xs font-bold text-[#2A2623] mb-1.5">
                    Rating Scale Maximum
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[5, 10].map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() =>
                          handleUpdateQuestion(activeQuestion.id, {
                            maxRating: scale,
                          })
                        }
                        className={`py-2 px-3 rounded-xl border-2 border-[#2A2623] text-xs font-bold cursor-pointer ${
                          (activeQuestion.maxRating || 5) === scale
                            ? 'bg-[#F6D97A] text-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                            : 'bg-[#FAF6F0] text-[#6E655E]'
                        }`}
                      >
                        1 to {scale} Stars
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(activeQuestion.type === 'single_choice' ||
                activeQuestion.type === 'multiple_choice' ||
                activeQuestion.type === 'dropdown') && (
                <div className="space-y-2 pt-1 border-t border-[#2A2623]/15">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2A2623]">
                      Choices ({(activeQuestion.choices || []).length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const current = activeQuestion.choices || [];
                        const nextChoices = [
                          ...current,
                          {
                            id: generateId('opt'),
                            label: `Option ${current.length + 1}`,
                          },
                        ];
                        const synced = updateQuestionChoicesAndSyncRules(
                          activeQuestion,
                          nextChoices
                        );
                        handleUpdateQuestion(
                          activeQuestion.id,
                          {
                            choices: synced.choices,
                            logicRules: synced.logicRules,
                          },
                          { label: 'Add choice' }
                        );
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#D4573B] hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Choice</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(activeQuestion.choices || []).map((choice, cIdx) => {
                      const totalChoices = (activeQuestion.choices || []).length;
                      const isChoiceDragging = draggedChoiceIdx === cIdx;
                      const isChoiceDropTarget =
                        dropTargetChoiceIdx === cIdx &&
                        draggedChoiceIdx !== null &&
                        draggedChoiceIdx !== cIdx;

                      return (
                        <div
                          key={choice.id}
                          data-testid={`builder-choice-item-${cIdx}`}
                          draggable={totalChoices > 1}
                          onDragStart={(e) => {
                            setDraggedChoiceIdx(cIdx);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(cIdx));
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dropTargetChoiceIdx !== cIdx) {
                              setDropTargetChoiceIdx(cIdx);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromIdx =
                              draggedChoiceIdx ??
                              Number.parseInt(
                                e.dataTransfer.getData('text/plain'),
                                10
                              );
                            setDraggedChoiceIdx(null);
                            setDropTargetChoiceIdx(null);
                            if (Number.isFinite(fromIdx) && fromIdx !== cIdx) {
                              handleReorderChoice(fromIdx, cIdx);
                            }
                          }}
                          onDragEnd={() => {
                            setDraggedChoiceIdx(null);
                            setDropTargetChoiceIdx(null);
                          }}
                          className={`flex items-center gap-1 rounded-lg transition-all ${
                            isChoiceDragging ? 'opacity-40' : ''
                          } ${
                            isChoiceDropTarget
                              ? 'ring-2 ring-[#E86D52] bg-[#FFF9EB]'
                              : ''
                          }`}
                        >
                          <span
                            title="Drag to reorder choice"
                            aria-hidden="true"
                            className="text-[#9C9288] hover:text-[#2A2623] cursor-grab active:cursor-grabbing shrink-0"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>
                          <span className="font-mono text-xs font-bold text-[#6E655E] w-4 text-center shrink-0">
                            {String.fromCharCode(65 + cIdx)}
                          </span>
                          <input
                            type="text"
                            aria-label={`Choice ${cIdx + 1}`}
                            value={choice.label}
                            onChange={(e) => {
                              const updated = (activeQuestion.choices || []).map(
                                (item, i) =>
                                  i === cIdx
                                    ? { ...item, label: e.target.value }
                                    : item
                              );
                              const synced = updateQuestionChoicesAndSyncRules(
                                activeQuestion,
                                updated
                              );
                              handleUpdateQuestion(
                                activeQuestion.id,
                                {
                                  choices: synced.choices,
                                  logicRules: synced.logicRules,
                                },
                                {
                                  label: 'Edit choice label',
                                  coalesceKey: `choice-label-${choice.id}`,
                                }
                              );
                            }}
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-medium bg-[#FAF6F0] border-2 border-[#2A2623] rounded-lg focus:outline-none"
                          />
                          <div className="flex items-center shrink-0">
                            <button
                              type="button"
                              disabled={cIdx === 0}
                              onClick={() => handleReorderChoice(cIdx, cIdx - 1)}
                              aria-label={`Move choice ${cIdx + 1} up`}
                              title="Move choice up"
                              className="p-1 rounded text-[#6E655E] hover:text-[#2A2623] hover:bg-[#EFE9DE] disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={cIdx === totalChoices - 1}
                              onClick={() => handleReorderChoice(cIdx, cIdx + 1)}
                              aria-label={`Move choice ${cIdx + 1} down`}
                              title="Move choice down"
                              className="p-1 rounded text-[#6E655E] hover:text-[#2A2623] hover:bg-[#EFE9DE] disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={totalChoices <= 1}
                              onClick={() => {
                                const filtered = (
                                  activeQuestion.choices || []
                                ).filter((_, i) => i !== cIdx);
                                const synced = updateQuestionChoicesAndSyncRules(
                                  activeQuestion,
                                  filtered
                                );
                                handleUpdateQuestion(
                                  activeQuestion.id,
                                  {
                                    choices: synced.choices,
                                    logicRules: synced.logicRules,
                                  },
                                  { label: 'Remove choice' }
                                );
                              }}
                              aria-label={`Remove choice ${choice.label}`}
                              className="p-1 rounded text-[#6E655E] hover:text-[#D4573B] hover:bg-[#FDECE8] disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border-2 border-[#2A2623] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2A2623] flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-[#E86D52]" />
                    <span>Branching Logic</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-[#6E655E] tabular-nums">
                    {activeQuestion.logicRules.length} active
                  </span>
                </div>
                <p className="text-[11px] text-[#6E655E] leading-relaxed">
                  {activeQuestion.logicRules.length > 0
                    ? 'This question dynamically routes respondents based on their answer.'
                    : 'No conditional jumps configured yet — proceeds to the next question in order.'}
                </p>
                <PaperButton
                  variant="yellow"
                  size="sm"
                  className="w-full"
                  onClick={() => onSwitchToFlow(activeQuestion.id)}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Configure in Flow Editor</span>
                </PaperButton>
              </div>
            </div>
          )}
          {selectedNode.kind === 'completion' && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="inspector-comp-title"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Thank-You Headline
                </label>
                <input
                  id="inspector-comp-title"
                  type="text"
                  value={form.completionScreen.title}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          title: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit completion title',
                        coalesceKey: 'comp-title',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-sm font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="inspector-comp-desc"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Closing Note
                </label>
                <textarea
                  id="inspector-comp-desc"
                  rows={3}
                  value={form.completionScreen.description}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          description: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit completion description',
                        coalesceKey: 'comp-desc',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none resize-none"
                />
              </div>

              <div>
                <label
                  htmlFor="inspector-comp-btn"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Restart Button Label
                </label>
                <input
                  id="inspector-comp-btn"
                  type="text"
                  value={form.completionScreen.buttonText}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          buttonText: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit completion button',
                        coalesceKey: 'comp-btn',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                />
              </div>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-[#2A2623]">
                    Show Answer Receipt
                  </p>
                  <p className="text-[11px] text-[#6E655E]">
                    Display a stamped summary of submitted answers
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.completionScreen.showAnswerReceipt}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          showAnswerReceipt: e.target.checked,
                        },
                      }),
                      { label: 'Toggle answer receipt' }
                    )
                  }
                  className="w-4 h-4 accent-[#E86D52]"
                />
              </label>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
