'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FormSchema,
  AnswerValue,
  FormResponseRecord,
  FormRevisionSnapshot,
  AnalyticsEvent,
  FormAnalyticsSessionTracker,
  captureSessionAttribution,
  classifyViewportWidth,
  hasAnyUtmParameter,
  validateQuestionAnswer,
  resolveNextNodeId,
  computeActiveQuestionSequence,
  normalizeAnswerString,
  processFormSubmission,
} from '@/lib/form-engine';
import { PaperButton } from './paper-primitives';
import { QuestionRenderer, ThemedActionButton } from './question-renderer';
import {
  ThemedFormCard,
  ThemedWelcomeScreen,
  ThemedCompletionBadge,
} from './themed-form-surface';
import {
  resolveFormAppearance,
  getBackgroundTreatmentStyle,
} from '@/themes/appearance-registry';
import {
  ArrowLeft,
  RotateCcw,
  X,
  MessageSquareText,
  GitBranch,
  Palette,
  Link2,
} from 'lucide-react';

interface FormPresentationProps {
  completionNotice?: string;
  storageLabel?: string;
  publicMode?: boolean;
  allowRepeat?: boolean;
  onShare?: () => void;
  form: FormSchema;
  onClosePreview: () => void;
  onSaveResponse: (
    response: FormResponseRecord,
    revisionSnapshot?: FormRevisionSnapshot
  ) => void | Promise<void>;
  onInspectResponses: () => void;
  onRecordAnalyticsEvent?: (event: AnalyticsEvent) => void;
  simulatedUtmQuery?: string;
  simulatedReferrer?: string;
}

export function FormPresentation({
  completionNotice,
  storageLabel,
  publicMode = false,
  allowRepeat = true,
  onShare,
  form,
  onClosePreview,
  onSaveResponse,
  onInspectResponses,
  onRecordAnalyticsEvent,
  simulatedUtmQuery,
  simulatedReferrer,
}: FormPresentationProps) {
  const prefersReducedMotion = useReducedMotion();
  const activeTokens = resolveFormAppearance(form.appearance, form.accentTheme);

  const initialStage =
    form.welcomeScreen.enabled && form.questions.length > 0
      ? 'welcome'
      : form.questions[0]?.id || 'completion';

  const [currentStage, setCurrentStage] = useState<string>(initialStage);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const submitting = useRef(false);
  const [lastBranchNotice, setLastBranchNotice] = useState<string | null>(null);

  const onRecordEventRef = useRef(onRecordAnalyticsEvent);
  useEffect(() => {
    onRecordEventRef.current = onRecordAnalyticsEvent;
  }, [onRecordAnalyticsEvent]);

  const sessionTrackerRef = useRef<FormAnalyticsSessionTracker | null>(null);
  const [activeAttributionLabel, setActiveAttributionLabel] = useState<
    string | null
  >(null);

  const initSessionTracker = React.useCallback(() => {
    const searchStr =
      simulatedUtmQuery !== undefined
        ? simulatedUtmQuery
        : publicMode && typeof window !== 'undefined'
        ? window.location.search
        : '';
    const referrerStr =
      simulatedReferrer !== undefined
        ? simulatedReferrer
        : publicMode && typeof document !== 'undefined'
        ? document.referrer
        : '';
    const currentOrigin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const viewport = classifyViewportWidth(
      typeof window !== 'undefined' ? window.innerWidth : undefined
    );

    const attribution = captureSessionAttribution({
      urlOrSearch: searchStr,
      rawReferrer: referrerStr,
      currentOrigin,
    });

    const hasUtm = hasAnyUtmParameter(attribution.utm);
    const tracker = new FormAnalyticsSessionTracker({
      formId: form.id,
      formRevision: form.revision || 1,
      attribution,
      viewport,
      sessionSource: publicMode ? 'public_live' : hasUtm ? 'url_test' : 'local_preview',
      onEmit: (ev) => {
        onRecordEventRef.current?.(ev);
      },
    });

    sessionTrackerRef.current = tracker;
    if (hasUtm) {
      const parts = [
        attribution.utm.utm_source && `source=${attribution.utm.utm_source}`,
        attribution.utm.utm_medium && `medium=${attribution.utm.utm_medium}`,
        attribution.utm.utm_campaign &&
          `campaign=${attribution.utm.utm_campaign}`,
      ].filter(Boolean);
      setActiveAttributionLabel(parts.join(' · ') || 'UTM active');
    } else {
      setActiveAttributionLabel(null);
    }

    tracker.recordFormView();
    if (initialStage !== 'welcome' && initialStage !== 'completion') {
      tracker.recordFormStart();
      tracker.recordQuestionView(initialStage);
    } else if (initialStage === 'completion') {
      tracker.recordFormStart();
      tracker.recordFormComplete();
    }
  }, [form.id, form.revision, initialStage, simulatedUtmQuery, simulatedReferrer, publicMode]);

    // Initialize session lifecycle on mount and handle tab visibility pause/resume
  useEffect(() => {
    if (!sessionTrackerRef.current) {
      initSessionTracker();
    }

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || !sessionTrackerRef.current) return;
      if (document.visibilityState === 'hidden') {
        sessionTrackerRef.current.pause();
      } else if (document.visibilityState === 'visible') {
        sessionTrackerRef.current.resume();
      }
    };

    const handlePageHide = () => {
      if (
        sessionTrackerRef.current &&
        !sessionTrackerRef.current.isCompleted()
      ) {
        sessionTrackerRef.current.recordQuestionExit();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [initSessionTracker]);

  const currentQuestion = form.questions.find((q) => q.id === currentStage);
  const activeSequence = computeActiveQuestionSequence(form, answers);
  const currentStepInSequence = currentQuestion
    ? Math.max(1, activeSequence.indexOf(currentQuestion.id) + 1)
    : activeSequence.length;

  const progressPercent =
    currentStage === 'welcome'
      ? 0
      : currentStage === 'completion'
      ? 100
      : activeSequence.length > 0
      ? Math.round((currentStepInSequence / activeSequence.length) * 100)
      : 50;

  const handleStartForm = () => {
    sessionTrackerRef.current?.recordFormStart();
    if (form.questions.length === 0) {
      sessionTrackerRef.current?.recordFormComplete();
      setCurrentStage('completion');
      return;
    }
    const firstQId = form.questions[0].id;
    sessionTrackerRef.current?.recordQuestionView(firstQId);
    setHistoryStack(['welcome']);
    setCurrentStage(firstQId);
    setValidationError(null);
  };

  const handleAdvanceQuestion = async () => {
    if (submitting.current) return;
    if (!currentQuestion) return;
    const val = answers[currentQuestion.id];
    const check = validateQuestionAnswer(currentQuestion, val);

    if (!check.valid) {
      const errMsg = check.error || 'Please check your answer.';
      setValidationError(errMsg);
      sessionTrackerRef.current?.recordValidationError(currentQuestion, errMsg);
      return;
    }

    setValidationError(null);
    const nextNodeId = resolveNextNodeId(form, currentQuestion.id, answers);

    // Record question answered + active duration + branch transition
    sessionTrackerRef.current?.recordQuestionAnswered(
      currentQuestion,
      val,
      nextNodeId
    );

    // Check if this took a non-sequential branch so we can show a subtle helpful indicator
    const sequentialIdx = form.questions.findIndex(
      (q) => q.id === currentQuestion.id
    );
    const sequentialNextId =
      form.questions[sequentialIdx + 1]?.id || 'completion';
    if (nextNodeId !== sequentialNextId) {
      const targetQ = form.questions.find((q) => q.id === nextNodeId);
      setLastBranchNotice(
        targetQ
          ? `Branched to "${targetQ.title}" based on your answer`
          : 'Branched directly to Completion Screen based on your answer'
      );
    } else {
      setLastBranchNotice(null);
    }

    const nextHistory = [...historyStack, currentQuestion.id];
    setHistoryStack(nextHistory);

    if (nextNodeId === 'completion') {
      const visitedQuestionIds = nextHistory.filter((id) => id !== 'welcome');
      const completeInfo = sessionTrackerRef.current?.recordFormComplete();
      const durationSeconds = completeInfo?.durationSeconds ?? 1;
      const tracker = sessionTrackerRef.current;

      const submissionResult = processFormSubmission(form, answers, {
        durationSeconds,
        visitedQuestionIds,
        attribution: tracker?.getAttribution(),
        viewport: tracker?.getViewport(),
        sessionId: tracker?.getSessionId(),
        sessionSource: tracker?.getSessionSource(),
      });
      if (submissionResult.valid && submissionResult.record) {
        submitting.current = true;
        try {
          await onSaveResponse(submissionResult.record, submissionResult.revisionSnapshot);
        } catch (error) {
          setValidationError(error instanceof Error ? error.message : 'Unable to submit. Please try again.');
          return;
        } finally { submitting.current = false; }
      } else {
        setValidationError('Please review the required answers before submitting.');
        return;
      }
    } else {
      sessionTrackerRef.current?.recordQuestionView(nextNodeId);
    }

    setCurrentStage(nextNodeId);
  };

  const handleStepBack = () => {
    if (submitting.current) return;
    if (historyStack.length === 0) return;
    const copy = [...historyStack];
    const prevId = copy.pop()!;
    setHistoryStack(copy);
    setCurrentStage(prevId);
    if (prevId !== 'welcome' && prevId !== 'completion') {
      sessionTrackerRef.current?.recordQuestionView(prevId);
    }
    setValidationError(null);
    setLastBranchNotice(null);
  };

  const handleRestart = () => {
    if (submitting.current) return;
    if (
      sessionTrackerRef.current &&
      !sessionTrackerRef.current.isCompleted()
    ) {
      sessionTrackerRef.current.recordQuestionExit();
    }
    setAnswers({});
    setHistoryStack([]);
    setValidationError(null);
    setLastBranchNotice(null);
    setCurrentStage(initialStage);
    initSessionTracker();
  };

  const handleExitPreview = () => {
    if (
      sessionTrackerRef.current &&
      !sessionTrackerRef.current.isCompleted()
    ) {
      sessionTrackerRef.current.recordQuestionExit();
    }
    onClosePreview();
  };

  // Global keyboard shortcuts for Welcome screen and single-key choice selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isTypingInInput =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select';

      if (currentStage === 'welcome' && e.key === 'Enter' && !isTypingInInput) {
        e.preventDefault();
        handleStartForm();
        return;
      }

      if (!currentQuestion || isTypingInInput) return;

      if (currentQuestion.type === 'yes_no') {
        if (e.key.toLowerCase() === 'y') {
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: 'Yes' }));
          setValidationError(null);
        } else if (e.key.toLowerCase() === 'n') {
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: 'No' }));
          setValidationError(null);
        }
      } else if (currentQuestion.type === 'rating') {
        const max = currentQuestion.maxRating || 5;
        const num = e.key === '0' && max === 10 ? 10 : Number(e.key);
        if (!Number.isNaN(num) && num >= 1 && num <= max) {
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: num }));
          setValidationError(null);
        }
      } else if (
        currentQuestion.type === 'single_choice' &&
        currentQuestion.choices
      ) {
        const code = e.key.toUpperCase().charCodeAt(0) - 65;
        if (
          e.key.length === 1 &&
          code >= 0 &&
          code < currentQuestion.choices.length
        ) {
          const picked = currentQuestion.choices[code].label;
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: picked }));
          setValidationError(null);
        }
      } else if (
        currentQuestion.type === 'multiple_choice' &&
        currentQuestion.choices
      ) {
        const code = e.key.toUpperCase().charCodeAt(0) - 65;
        if (
          e.key.length === 1 &&
          code >= 0 &&
          code < currentQuestion.choices.length
        ) {
          const picked = currentQuestion.choices[code].label;
          setAnswers((prev) => {
            const current = Array.isArray(prev[currentQuestion.id])
              ? (prev[currentQuestion.id] as string[])
              : [];
            const next = current.includes(picked)
              ? current.filter((item) => item !== picked)
              : [...current, picked];
            return { ...prev, [currentQuestion.id]: next };
          });
          setValidationError(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -14 },
        transition: { duration: 0.18 },
      };

  return (
    <div
      className="min-h-[calc(100vh-64px)] flex flex-col justify-between px-4 py-6 sm:px-6 transition-colors duration-200"
      style={getBackgroundTreatmentStyle(activeTokens)}
    >
      <div className="max-w-3xl w-full mx-auto space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl px-4 py-2.5 shadow-[3px_3px_0px_#2A2623]">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full border border-[#2A2623] shrink-0"
              style={{ backgroundColor: activeTokens.primaryColor }}
            />
            <span className="font-display text-sm font-bold text-[#2A2623] truncate">
              {form.title}
            </span>
            {!publicMode && <span className="text-xs text-[#6E655E] hidden sm:inline-flex items-center gap-1">
              <span>·</span>
              <Palette className="w-3 h-3 text-[#E86D52]" />
              <span>{activeTokens.templateName} Theme</span>
            </span>}
            {!publicMode && activeAttributionLabel && (
              <span
                data-testid="preview-active-utm-indicator"
                className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#2A2623] bg-[#F6D97A]/50 px-2 py-0.5 rounded-md border border-[#2A2623]/20 truncate max-w-[220px]"
                title={`Session attribution captured: ${activeAttributionLabel}`}
              >
                <Link2 className="w-3 h-3 text-[#E86D52] shrink-0" />
                <span className="truncate">{activeAttributionLabel}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onShare && <PaperButton size="sm" variant="ghost" onClick={onShare}>Share</PaperButton>}
            {(allowRepeat || currentStage !== 'completion') && <button
              type="button"
              onClick={handleRestart}
              aria-label={publicMode ? 'Restart form' : 'Restart form preview'}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#6E655E] hover:text-[#2A2623] hover:bg-[#FAF6F0] rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>}
            {!publicMode && <PaperButton
              variant="ivory"
              size="sm"
              onClick={handleExitPreview}
              aria-label="Exit Preview"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit Preview</span>
            </PaperButton>}
          </div>
        </div>
        <div className="flex items-center gap-3 px-1">
          <div
            className="flex-1 h-2.5 rounded-full overflow-hidden"
            style={{
              backgroundColor: activeTokens.inputBackground,
              border: `1.5px solid ${activeTokens.borderColor}`,
            }}
          >
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: activeTokens.primaryColor,
              }}
            />
          </div>
          <span
            className="font-mono text-xs font-bold tabular-nums w-10 text-right"
            style={{ color: activeTokens.textColor }}
          >
            {progressPercent}%
          </span>
        </div>
      </div>
      <div className="w-full mx-auto my-8">
        <AnimatePresence mode="wait">
          <motion.div key={currentStage} {...motionProps}>
            <ThemedFormCard
              appearance={activeTokens}
              footer={
                currentStage !== 'welcome' && currentStage !== 'completion' ? (
                  <div
                    className="w-full flex items-center justify-between text-xs"
                    style={{ color: activeTokens.mutedTextColor }}
                  >
                    <button
                      type="button"
                      onClick={handleStepBack}
                      disabled={historyStack.length === 0}
                      className="inline-flex items-center gap-1.5 font-bold disabled:opacity-40 cursor-pointer"
                      style={{ color: activeTokens.textColor }}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Previous Step</span>
                    </button>

                    <span>
                      Keyboard shortcuts active ·{' '}
                      <strong
                        className="font-mono"
                        style={{ color: activeTokens.textColor }}
                      >
                        Enter
                      </strong>{' '}
                      to advance
                    </span>
                  </div>
                ) : undefined
              }
            >
              {!publicMode && lastBranchNotice && (
                <div
                  className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
                  style={{
                    backgroundColor: activeTokens.selectedOptionBg,
                    color: activeTokens.textColor,
                    border: `1.5px solid ${activeTokens.borderColor}`,
                    borderRadius: '10px',
                  }}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>{lastBranchNotice}</span>
                </div>
              )}
              {currentStage === 'welcome' && (
                <ThemedWelcomeScreen
                  appearance={activeTokens}
                  title={form.welcomeScreen.title}
                  description={form.welcomeScreen.description}
                  buttonText={form.welcomeScreen.buttonText}
                  timeEstimate={
                    form.welcomeScreen.timeEstimate || 'Takes ~1 minute'
                  }
                  questionCount={form.questions.length}
                  enabled={form.welcomeScreen.enabled}
                  onStart={handleStartForm}
                />
              )}
              {currentQuestion && (
                <QuestionRenderer
                  question={currentQuestion}
                  stepNumber={currentStepInSequence}
                  totalSteps={activeSequence.length}
                  value={answers[currentQuestion.id]}
                  onChange={(val) => {
                    setAnswers((prev) => ({
                      ...prev,
                      [currentQuestion.id]: val,
                    }));
                    if (validationError) setValidationError(null);
                  }}
                  onSubmitStep={handleAdvanceQuestion}
                  error={validationError}
                  submitLabel={
                    resolveNextNodeId(form, currentQuestion.id, answers) ===
                    'completion'
                      ? 'Submit Form'
                      : 'Continue'
                  }
                  appearance={activeTokens}
                />
              )}
              {currentStage === 'completion' && (
                <div className="space-y-6 py-4">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <ThemedCompletionBadge appearance={activeTokens} />
                    <h2
                      className="text-2xl sm:text-3xl font-extrabold"
                      style={{
                        fontFamily: activeTokens.headingFontCss,
                        color: activeTokens.textColor,
                        textWrap: 'balance',
                      }}
                    >
                      {form.completionScreen.title}
                    </h2>
                    <p
                      className="text-sm sm:text-base max-w-md leading-relaxed"
                      style={{ color: activeTokens.mutedTextColor }}
                    >
                      {form.completionScreen.description === 'Your answers have been saved locally in this browser.'
                        ? completionNotice ?? 'Thank you for sharing your response.'
                        : form.completionScreen.description}
                    </p>
                  </div>
                  {form.completionScreen.showAnswerReceipt && (
                    <div
                      className="p-4 space-y-2.5 text-left rounded-2xl"
                      style={{
                        backgroundColor: activeTokens.inputBackground,
                        border: `1.5px solid ${activeTokens.borderColor}`,
                      }}
                    >
                      <div
                        className="flex items-center justify-between text-xs font-bold border-b pb-2"
                        style={{
                          color: activeTokens.mutedTextColor,
                          borderColor: activeTokens.borderColor,
                        }}
                      >
                        <span>
                          Your responses{!publicMode && <> (Revision {form.revision || 1})</>}
                        </span>
                        <span className="font-mono tabular-nums">
                          {historyStack.filter((id) => id !== 'welcome').length}{' '}
                          answered steps
                        </span>
                      </div>
                      <dl className="space-y-2 text-xs">
                        {historyStack
                          .filter((id) => id !== 'welcome')
                          .map((qId) => {
                            const qObj = form.questions.find(
                              (q) => q.id === qId
                            );
                            if (!qObj) return null;
                            const formatted =
                              normalizeAnswerString(answers[qId]) || 'Skipped';
                            return (
                              <div
                                key={qId}
                                className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 py-1 border-b border-dashed last:border-none"
                                style={{ borderColor: activeTokens.borderColor }}
                              >
                                <dt
                                  className="font-semibold truncate sm:max-w-[55%]"
                                  style={{ color: activeTokens.mutedTextColor }}
                                >
                                  {qObj.title}
                                </dt>
                                <dd
                                  className="font-bold"
                                  style={{ color: activeTokens.textColor }}
                                >
                                  {formatted}
                                </dd>
                              </div>
                            );
                          })}
                      </dl>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {!publicMode && <ThemedActionButton
                      appearance={activeTokens}
                      size="md"
                      onClick={onInspectResponses}
                    >
                      <MessageSquareText className="w-4 h-4" />
                      <span>View Analytics & Responses</span>
                    </ThemedActionButton>}
                    {allowRepeat && <ThemedActionButton
                      appearance={activeTokens}
                      variant="secondary"
                      size="md"
                      onClick={handleRestart}
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>
                        {form.completionScreen.buttonText ||
                          'Submit Another Test'}
                      </span>
                    </ThemedActionButton>}
                  </div>
                </div>
              )}
            </ThemedFormCard>
          </motion.div>
        </AnimatePresence>
      </div>
      <div
        className="max-w-3xl w-full mx-auto text-center text-xs"
        style={{ color: activeTokens.mutedTextColor }}
      >
        <span>
          {storageLabel ?? 'Preview · Responses are saved only on this device.'}
        </span>
      </div>
    </div>
  );
}
