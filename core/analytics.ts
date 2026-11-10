import {
  FormSchema,
  FormQuestion,
  FormResponseRecord,
  FormRevisionSnapshot,
  AnswerValue,
  QuestionType,
  generateId,
} from './types';
import {
  SessionAttribution,
  UtmAttribution,
  ViewportCategory,
  sanitizeSessionAttribution,
  createEmptyUtmAttribution,
  hasAnyUtmParameter,
} from './attribution';
import { evaluateRuleCondition, resolveNextNodeId } from './branching';
import { resolveHistoricalSubmissionItems } from './submissions';

export const ANALYTICS_SCHEMA_VERSION = 1;

export type AnalyticsEventType =
  | 'form_view'
  | 'form_start'
  | 'question_view'
  | 'question_answered'
  | 'validation_error'
  | 'question_exit'
  | 'form_complete';

export type AnalyticsSessionSource =
  | 'local_preview'
  | 'url_test'
  | 'public_live';

export interface AnalyticsEvent {
  id: string;
  schemaVersion: number;
  formId: string;
  formRevision: number;
  sessionId: string;
  type: AnalyticsEventType;
  timestamp: string;
  questionId?: string;
  targetNodeId?: string;
  ruleId?: string;
  activeDurationMs?: number;
  errorCode?: string;
  attribution?: SessionAttribution;
  viewport?: ViewportCategory;
  sessionSource: AnalyticsSessionSource;
  dedupeKey?: string;
}

export const VALID_ANALYTICS_EVENT_TYPES = new Set<AnalyticsEventType>([
  'form_view',
  'form_start',
  'question_view',
  'question_answered',
  'validation_error',
  'question_exit',
  'form_complete',
]);

export const VALID_VIEWPORT_CATEGORIES = new Set<ViewportCategory>([
  'mobile',
  'tablet',
  'desktop',
  'unknown',
]);

export const VALID_SESSION_SOURCES = new Set<AnalyticsSessionSource>([
  'local_preview',
  'url_test',
  'public_live',
]);

/**
 * Maximum single-step active duration (5 minutes) to prevent an idle open tab
 * from distorting average question time or completion time.
 */
export const MAX_ACTIVE_STEP_CAP_MS = 5 * 60 * 1000;

/**
 * Default observation window (15 minutes) after the last recorded interaction
 * before an uncompleted session without an explicit exit event is classified as incomplete.
 */
export const DEFAULT_INCOMPLETE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Bounded retention limits so local analytics events never consume unbounded storage.
 */
export const MAX_EVENTS_PER_FORM = 1000;
export const MAX_EVENTS_PER_WORKSPACE = 2500;

const FORBIDDEN_RAW_ANSWER_KEYS = new Set([
  'answer',
  'answers',
  'rawAnswer',
  'rawAnswers',
  'value',
  'rawValue',
  'displayValue',
  'email',
  'freeText',
  'responseText',
]);

/**
 * Validates and sanitizes an untrusted AnalyticsEvent object, stripping any
 * raw answer fields or unexpected properties so behavioral events never store PII.
 */
export function sanitizeAnalyticsEvent(raw: unknown): AnalyticsEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id.trim()) return null;
  if (typeof obj.formId !== 'string' || !obj.formId.trim()) return null;
  if (typeof obj.sessionId !== 'string' || !obj.sessionId.trim()) return null;
  if (
    typeof obj.type !== 'string' ||
    !VALID_ANALYTICS_EVENT_TYPES.has(obj.type as AnalyticsEventType)
  ) {
    return null;
  }

  const type = obj.type as AnalyticsEventType;
  const formRevision =
    typeof obj.formRevision === 'number' &&
    Number.isFinite(obj.formRevision) &&
    obj.formRevision >= 1
      ? Math.floor(obj.formRevision)
      : 1;

  const timestamp =
    typeof obj.timestamp === 'string' && obj.timestamp.trim()
      ? obj.timestamp
      : new Date().toISOString();

  const activeDurationMs =
    typeof obj.activeDurationMs === 'number' &&
    Number.isFinite(obj.activeDurationMs) &&
    obj.activeDurationMs >= 0
      ? Math.min(Math.round(obj.activeDurationMs), MAX_ACTIVE_STEP_CAP_MS * 12)
      : undefined;

  const viewport: ViewportCategory =
    typeof obj.viewport === 'string' &&
    VALID_VIEWPORT_CATEGORIES.has(obj.viewport as ViewportCategory)
      ? (obj.viewport as ViewportCategory)
      : 'unknown';

  const sessionSource: AnalyticsSessionSource =
    typeof obj.sessionSource === 'string' &&
    VALID_SESSION_SOURCES.has(obj.sessionSource as AnalyticsSessionSource)
      ? (obj.sessionSource as AnalyticsSessionSource)
      : 'local_preview';

  const attribution = sanitizeSessionAttribution(obj.attribution);

  const cleanEvent: AnalyticsEvent = {
    id: obj.id.trim(),
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    formId: obj.formId.trim(),
    formRevision,
    sessionId: obj.sessionId.trim(),
    type,
    timestamp,
    viewport,
    sessionSource,
    ...(typeof obj.questionId === 'string' && obj.questionId.trim()
      ? { questionId: obj.questionId.trim().slice(0, 128) }
      : {}),
    ...(typeof obj.targetNodeId === 'string' && obj.targetNodeId.trim()
      ? { targetNodeId: obj.targetNodeId.trim().slice(0, 128) }
      : {}),
    ...(typeof obj.ruleId === 'string' && obj.ruleId.trim()
      ? { ruleId: obj.ruleId.trim().slice(0, 128) }
      : {}),
    ...(activeDurationMs !== undefined ? { activeDurationMs } : {}),
    ...(typeof obj.errorCode === 'string' && obj.errorCode.trim()
      ? { errorCode: obj.errorCode.trim().slice(0, 64) }
      : {}),
    ...(attribution ? { attribution } : {}),
    ...(typeof obj.dedupeKey === 'string' && obj.dedupeKey.trim()
      ? { dedupeKey: obj.dedupeKey.trim().slice(0, 160) }
      : {}),
  };

  return cleanEvent;
}

/**
 * Verifies that an AnalyticsEvent object contains zero raw answer properties.
 */
export function hasNoRawAnswerFields(event: unknown): boolean {
  if (!event || typeof event !== 'object') return true;
  for (const key of Object.keys(event as Record<string, unknown>)) {
    if (FORBIDDEN_RAW_ANSWER_KEYS.has(key)) {
      return false;
    }
  }
  return true;
}

/**
 * Deduplicates an array of AnalyticsEvents using event IDs, explicit dedupeKeys,
 * and singleton session lifecycle rules (at most one form_view, form_start, and
 * form_complete per sessionId + formId).
 */
export function deduplicateAnalyticsEvents(
  events: AnalyticsEvent[]
): AnalyticsEvent[] {
  const seenIds = new Set<string>();
  const seenDedupeKeys = new Set<string>();
  const seenSessionSingletons = new Set<string>();
  const result: AnalyticsEvent[] = [];

  for (const raw of events) {
    const ev = sanitizeAnalyticsEvent(raw);
    if (!ev) continue;
    if (seenIds.has(ev.id)) continue;

    if (ev.dedupeKey) {
      if (seenDedupeKeys.has(ev.dedupeKey)) continue;
      seenDedupeKeys.add(ev.dedupeKey);
    }

    if (
      ev.type === 'form_view' ||
      ev.type === 'form_start' ||
      ev.type === 'form_complete'
    ) {
      const singletonKey = `${ev.formId}:${ev.sessionId}:${ev.type}`;
      if (seenSessionSingletons.has(singletonKey)) continue;
      seenSessionSingletons.add(singletonKey);
    }

    seenIds.add(ev.id);
    result.push(ev);
  }

  return result;
}

/**
 * Appends one or more analytics events while enforcing deduplication and bounded
 * per-form / per-workspace retention limits.
 */
export function appendAnalyticsEventsWithRetention(
  existingEvents: AnalyticsEvent[],
  newEvents: AnalyticsEvent[],
  options: {
    maxPerForm?: number;
    maxTotal?: number;
  } = {}
): AnalyticsEvent[] {
  const maxPerForm = options.maxPerForm ?? MAX_EVENTS_PER_FORM;
  const maxTotal = options.maxTotal ?? MAX_EVENTS_PER_WORKSPACE;

  const combined = deduplicateAnalyticsEvents([...existingEvents, ...newEvents]);

  // Sort chronologically ascending so newest events are kept when trimming
  combined.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Enforce per-form limit
  const countsByForm = new Map<string, number>();
  const keptReversed: AnalyticsEvent[] = [];
  for (let i = combined.length - 1; i >= 0; i--) {
    const ev = combined[i];
    const currentFormCount = countsByForm.get(ev.formId) || 0;
    if (currentFormCount < maxPerForm) {
      countsByForm.set(ev.formId, currentFormCount + 1);
      keptReversed.push(ev);
    }
  }

  const keptChronological = keptReversed.reverse();
  if (keptChronological.length <= maxTotal) {
    return keptChronological;
  }
  return keptChronological.slice(keptChronological.length - maxTotal);
}

/**
 * Classifies a validation error message or question constraint into a non-sensitive error code
 * so analytics never record the user's rejected input string.
 */
export function classifyValidationErrorCode(
  question: FormQuestion,
  errorMessage?: string
): string {
  const msg = (errorMessage || '').toLowerCase();
  if (msg.includes('required') || msg.includes('enter') || msg.includes('choose') || msg.includes('select')) {
    if (!question.required) return `invalid_${question.type}`;
    if (msg.includes('valid email')) return 'invalid_email';
    if (msg.includes('valid number') || msg.includes('at least') || msg.includes('at most')) {
      return `bounds_${question.type}`;
    }
    if (msg.includes('character')) return 'length_bounds';
    if (msg.includes('valid date') || msg.includes('calendar')) return 'invalid_date';
    return 'required';
  }
  if (msg.includes('email')) return 'invalid_email';
  if (msg.includes('character')) return 'length_bounds';
  if (msg.includes('date')) return 'invalid_date';
  return `invalid_${question.type}`;
}

/**
 * Resolves which specific LogicRule (if any) triggered the transition from a question,
 * or 'default' when the default path was taken.
 */
export function resolveTriggeredBranchRuleId(
  question: FormQuestion,
  answer: AnswerValue
): string | undefined {
  if (!question.logicRules || question.logicRules.length === 0) {
    return undefined;
  }
  for (const rule of question.logicRules) {
    if (evaluateRuleCondition(rule, answer, question)) {
      return rule.id;
    }
  }
  return 'default';
}

/**
 * Framework-independent respondent session lifecycle tracker.
 * - Captures session-entry attribution once and preserves it across step navigation
 * - Tracks active foreground time on each question and across the session, pausing when backgrounded
 * - Emits portable AnalyticsEvent objects via an optional callback or internal buffer
 * - Never records raw answer values in behavioral events
 */
export class FormAnalyticsSessionTracker {
  private readonly formId: string;
  private readonly formRevision: number;
  private readonly sessionId: string;
  private readonly attribution: SessionAttribution;
  private readonly viewport: ViewportCategory;
  private readonly sessionSource: AnalyticsSessionSource;
  private readonly onEmit?: (event: AnalyticsEvent) => void;

  private events: AnalyticsEvent[] = [];
  private hasViewed = false;
  private hasStarted = false;
  private hasCompleted = false;
  private hasExited = false;

  private currentQuestionId: string | null = null;
  private questionEnteredAtMs: number | null = null;
  private questionAccumulatedMs = 0;

  private sessionStartedAtMs: number | null = null;
  private sessionAccumulatedMs = 0;
  private isPaused = false;

  constructor(options: {
    formId: string;
    formRevision?: number;
    sessionId?: string;
    attribution: SessionAttribution;
    viewport?: ViewportCategory;
    sessionSource?: AnalyticsSessionSource;
    onEmit?: (event: AnalyticsEvent) => void;
  }) {
    this.formId = options.formId;
    this.formRevision = options.formRevision || 1;
    this.sessionId = options.sessionId || generateId('sess');
    this.attribution = options.attribution;
    this.viewport = options.viewport || 'unknown';
    this.sessionSource = options.sessionSource || 'local_preview';
    this.onEmit = options.onEmit;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getAttribution(): SessionAttribution {
    return this.attribution;
  }

  getViewport(): ViewportCategory {
    return this.viewport;
  }

  getSessionSource(): AnalyticsSessionSource {
    return this.sessionSource;
  }

  getRecordedEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  isCompleted(): boolean {
    return this.hasCompleted;
  }

  private emit(
    partial: Omit<
      AnalyticsEvent,
      | 'id'
      | 'schemaVersion'
      | 'formId'
      | 'formRevision'
      | 'sessionId'
      | 'attribution'
      | 'viewport'
      | 'sessionSource'
    >
  ): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: generateId('evt'),
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      formId: this.formId,
      formRevision: this.formRevision,
      sessionId: this.sessionId,
      attribution: this.attribution,
      viewport: this.viewport,
      sessionSource: this.sessionSource,
      ...partial,
    };
    this.events.push(event);
    if (this.onEmit) {
      this.onEmit(event);
    }
    return event;
  }

  private flushActiveTimers(nowMs: number): void {
    if (this.isPaused) return;
    if (this.questionEnteredAtMs !== null) {
      const delta = Math.max(0, nowMs - this.questionEnteredAtMs);
      this.questionAccumulatedMs += Math.min(delta, MAX_ACTIVE_STEP_CAP_MS);
      this.questionEnteredAtMs = nowMs;
    }
    if (this.sessionStartedAtMs !== null) {
      const delta = Math.max(0, nowMs - this.sessionStartedAtMs);
      this.sessionAccumulatedMs += Math.min(delta, MAX_ACTIVE_STEP_CAP_MS);
      this.sessionStartedAtMs = nowMs;
    }
  }

  /**
   * Pauses active-time accumulation (e.g., when browser tab becomes hidden).
   */
  pause(nowMs = Date.now()): void {
    if (this.isPaused) return;
    this.flushActiveTimers(nowMs);
    this.isPaused = true;
    this.questionEnteredAtMs = null;
    this.sessionStartedAtMs = null;
  }

  /**
   * Resumes active-time accumulation when the respondent returns to the tab.
   */
  resume(nowMs = Date.now()): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.currentQuestionId !== null && !this.hasCompleted) {
      this.questionEnteredAtMs = nowMs;
    }
    if (this.hasStarted && !this.hasCompleted) {
      this.sessionStartedAtMs = nowMs;
    }
  }

  /**
   * Records that the form was viewed by the respondent (once per session).
   */
  recordFormView(nowMs = Date.now()): AnalyticsEvent | null {
    if (this.hasViewed) return null;
    this.hasViewed = true;
    return this.emit({
      type: 'form_view',
      timestamp: new Date(nowMs).toISOString(),
      dedupeKey: `${this.formId}:${this.sessionId}:form_view`,
    });
  }

  /**
   * Records that the respondent started the form (clicked Start on welcome screen
   * or entered the first question directly).
   */
  recordFormStart(nowMs = Date.now()): AnalyticsEvent | null {
    if (!this.hasViewed) {
      this.recordFormView(nowMs);
    }
    if (this.hasStarted) return null;
    this.hasStarted = true;
    if (!this.isPaused) {
      this.sessionStartedAtMs = nowMs;
    }
    return this.emit({
      type: 'form_start',
      timestamp: new Date(nowMs).toISOString(),
      dedupeKey: `${this.formId}:${this.sessionId}:form_start`,
    });
  }

  /**
   * Records that a specific question was displayed to the respondent.
   */
  recordQuestionView(
    questionId: string,
    nowMs = Date.now()
  ): AnalyticsEvent | null {
    if (!questionId) return null;
    if (!this.hasStarted) {
      this.recordFormStart(nowMs);
    }

    if (this.currentQuestionId === questionId) {
      return null;
    }

    this.flushActiveTimers(nowMs);
    this.currentQuestionId = questionId;
    this.questionAccumulatedMs = 0;
    this.questionEnteredAtMs = this.isPaused ? null : nowMs;

    return this.emit({
      type: 'question_view',
      questionId,
      timestamp: new Date(nowMs).toISOString(),
    });
  }

  /**
   * Records that a validation error occurred on the current question without storing the raw input.
   */
  recordValidationError(
    question: FormQuestion,
    errorMessage?: string,
    nowMs = Date.now()
  ): AnalyticsEvent {
    const errorCode = classifyValidationErrorCode(question, errorMessage);
    return this.emit({
      type: 'validation_error',
      questionId: question.id,
      errorCode,
      timestamp: new Date(nowMs).toISOString(),
    });
  }

  /**
   * Records that the respondent answered or advanced past a question, including
   * active time spent on the question and which branch target/rule was followed.
   */
  recordQuestionAnswered(
    question: FormQuestion,
    answer: AnswerValue,
    targetNodeId: string,
    nowMs = Date.now()
  ): AnalyticsEvent {
    this.flushActiveTimers(nowMs);
    const spentMs = Math.max(100, Math.round(this.questionAccumulatedMs));
    const ruleId = resolveTriggeredBranchRuleId(question, answer);

    this.questionAccumulatedMs = 0;
    this.questionEnteredAtMs = this.isPaused ? null : nowMs;

    return this.emit({
      type: 'question_answered',
      questionId: question.id,
      targetNodeId,
      ...(ruleId ? { ruleId } : {}),
      activeDurationMs: spentMs,
      timestamp: new Date(nowMs).toISOString(),
    });
  }

  /**
   * Records that the respondent exited the form before completing it (e.g., closed preview).
   */
  recordQuestionExit(nowMs = Date.now()): AnalyticsEvent | null {
    if (this.hasCompleted || this.hasExited || !this.hasViewed) return null;
    this.flushActiveTimers(nowMs);
    this.hasExited = true;
    const spentMs = Math.round(this.questionAccumulatedMs);

    return this.emit({
      type: 'question_exit',
      ...(this.currentQuestionId ? { questionId: this.currentQuestionId } : {}),
      activeDurationMs: spentMs,
      timestamp: new Date(nowMs).toISOString(),
      dedupeKey: `${this.formId}:${this.sessionId}:question_exit`,
    });
  }

  /**
   * Records that the respondent completed the form and returns the active session duration in seconds.
   */
  recordFormComplete(nowMs = Date.now()): {
    event: AnalyticsEvent | null;
    durationSeconds: number;
  } {
    if (!this.hasStarted) {
      this.recordFormStart(nowMs);
    }
    this.flushActiveTimers(nowMs);
    const durationSeconds = Math.max(
      1,
      Math.round(this.sessionAccumulatedMs / 1000)
    );

    if (this.hasCompleted) {
      return { event: null, durationSeconds };
    }

    this.hasCompleted = true;
    this.currentQuestionId = null;
    this.questionEnteredAtMs = null;
    this.sessionStartedAtMs = null;

    const event = this.emit({
      type: 'form_complete',
      activeDurationMs: durationSeconds * 1000,
      timestamp: new Date(nowMs).toISOString(),
      dedupeKey: `${this.formId}:${this.sessionId}:form_complete`,
    });

    return { event, durationSeconds };
  }
}

export type AnalyticsDateRangePreset = 'all' | 'today' | '7d' | '30d';

export interface AnalyticsFilterOptions {
  dateRange?: AnalyticsDateRangePreset;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  nowMs?: number;
  incompleteWindowMs?: number;
}

export interface DailyActivityPoint {
  dateKey: string; // YYYY-MM-DD
  label: string; // e.g. Nov 2
  views: number;
  starts: number;
  completions: number;
  submissions: number;
}

export interface QuestionChoiceDistributionItem {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

export interface NumericSummaryMetrics {
  min: number;
  max: number;
  average: number;
  median: number;
  buckets: { label: string; count: number; percentage: number }[];
}

export interface TextPrivacySummaryMetrics {
  totalResponses: number;
  shortCount: number; // < 25 chars
  mediumCount: number; // 25..100 chars
  longCount: number; // > 100 chars
  validEmailDomainCount?: number;
}

export interface DateSummaryMetrics {
  earliestDate: string | null;
  latestDate: string | null;
  distinctDatesCount: number;
}

export interface QuestionAnalyticsMetrics {
  questionId: string;
  questionIndex: number;
  questionTitle: string;
  questionType: QuestionType;
  required: boolean;
  reachedCount: number;
  answeredCount: number;
  skippedCount: number;
  exitCount: number;
  dropOffRate: number; // 0..100
  avgTimeSpentSeconds: number | null;
  validationErrorCount: number;
  validationErrorSessions: number;
  choiceDistribution?: QuestionChoiceDistributionItem[];
  ratingMetrics?: {
    maxRating: number;
    average: number | null;
    median: number | null;
    distribution: QuestionChoiceDistributionItem[];
  };
  numericMetrics?: NumericSummaryMetrics;
  textPrivacyMetrics?: TextPrivacySummaryMetrics;
  dateMetrics?: DateSummaryMetrics;
}

export interface FunnelStepMetric {
  stepId: string;
  label: string;
  kind: 'view' | 'start' | 'question' | 'complete';
  sessionCount: number;
  conversionFromPrevious: number | null; // 0..100
  conversionFromInitial: number | null; // 0..100
  dropOffCount: number;
}

export interface FlowOverlayAnalytics {
  nodeVisits: Record<string, number>;
  edgeTraversals: Record<
    string,
    {
      edgeId: string;
      sourceNodeId: string;
      targetNodeId: string;
      ruleId?: string;
      count: number;
      percentageOfSource: number;
    }
  >;
}

export interface AttributionBreakdownRow {
  key: string;
  label: string;
  isDirectOrUnknown: boolean;
  views: number;
  starts: number;
  completions: number;
  submissions: number;
  viewToCompletionRate: number | null;
  startToCompletionRate: number | null;
  avgCompletionSeconds: number | null;
}

export interface CampaignTrendPoint {
  dateKey: string;
  label: string;
  byCampaign: Record<string, { views: number; completions: number }>;
}

export interface SourceQuestionComparisonRow {
  sourceLabel: string;
  totalSessionsOrSubmissions: number;
  questionCompletionRates: Record<
    string,
    {
      reached: number;
      answered: number;
      completionRate: number;
    }
  >;
}

export interface FormAnalyticsReport {
  formId: string;
  overview: {
    formViews: number;
    formStarts: number;
    completedTrackedSessions: number;
    totalSubmissions: number;
    historicalPreAnalyticsSubmissions: number;
    incompleteSessions: number;
    activeSessions: number;
    viewToStartRate: number | null;
    startToCompletionRate: number | null;
    viewToCompletionRate: number | null;
    avgCompletionSeconds: number | null;
    medianCompletionSeconds: number | null;
    hasTrackedBehavioralEvents: boolean;
    dailyTrends: DailyActivityPoint[];
  };
  questions: QuestionAnalyticsMetrics[];
  funnel: FunnelStepMetric[];
  flowOverlay: FlowOverlayAnalytics;
  acquisition: {
    bySource: AttributionBreakdownRow[];
    byMedium: AttributionBreakdownRow[];
    byCampaign: AttributionBreakdownRow[];
    byContent: AttributionBreakdownRow[];
    byTerm: AttributionBreakdownRow[];
    byReferrer: AttributionBreakdownRow[];
    directOrUnknownViews: number;
    directOrUnknownSubmissions: number;
     attributedViews: number;
    attributedSubmissions: number;
    availableSources: string[];
    availableMediums: string[];
    availableCampaigns: string[];
    campaignTrends: CampaignTrendPoint[];
    sourceQuestionComparison: SourceQuestionComparisonRow[];
  };
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return Math.round(sorted[mid]);
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function computeMedianFloat(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return Number(sorted[mid].toFixed(1));
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
}

function formatDateKey(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return 'Unknown';
  }
}

function formatShortDateLabel(dateKey: string): string {
  if (dateKey === 'Unknown') return 'Unknown';
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
  } catch {
    return dateKey;
  }
}

function isWithinDateRange(
  isoTimestamp: string,
  preset: AnalyticsDateRangePreset,
  nowMs: number
): boolean {
  if (preset === 'all') return true;
  const ts = new Date(isoTimestamp).getTime();
  if (Number.isNaN(ts)) return false;

  const dayMs = 24 * 60 * 60 * 1000;
  if (preset === 'today') {
    const nowDateKey = formatDateKey(new Date(nowMs).toISOString());
    return formatDateKey(isoTimestamp) === nowDateKey;
  }
  if (preset === '7d') {
    return ts >= nowMs - 7 * dayMs && ts <= nowMs + dayMs;
  }
  if (preset === '30d') {
    return ts >= nowMs - 30 * dayMs && ts <= nowMs + dayMs;
  }
  return true;
}

function matchesAttributionFilters(
  attribution: SessionAttribution | undefined,
  filters: AnalyticsFilterOptions
): boolean {
  const utm = attribution?.utm || createEmptyUtmAttribution();
  const sourceLabel = utm.utm_source || 'Direct / Unknown';
  const mediumLabel = utm.utm_medium || 'Direct / Unknown';
  const campaignLabel = utm.utm_campaign || 'Direct / Unknown';

  if (
    filters.utmSource &&
    filters.utmSource !== 'all' &&
    sourceLabel.toLowerCase() !== filters.utmSource.toLowerCase()
  ) {
    return false;
  }
  if (
    filters.utmMedium &&
    filters.utmMedium !== 'all' &&
    mediumLabel.toLowerCase() !== filters.utmMedium.toLowerCase()
  ) {
    return false;
  }
  if (
    filters.utmCampaign &&
    filters.utmCampaign !== 'all' &&
    campaignLabel.toLowerCase() !== filters.utmCampaign.toLowerCase()
  ) {
    return false;
  }
  return true;
}

interface AggregatedSessionState {
  sessionId: string;
  firstTimestamp: string;
  lastTimestamp: string;
  hasView: boolean;
  hasStart: boolean;
  hasComplete: boolean;
  hasExplicitExit: boolean;
  lastQuestionId: string | null;
  viewedQuestionIds: Set<string>;
  answeredQuestionIds: Set<string>;
  questionDurationsMs: Map<string, number>;
  validationErrorsByQuestion: Map<string, number>;
  transitions: Array<{
    sourceId: string;
    targetId: string;
    ruleId?: string;
  }>;
  completionDurationSeconds: number | null;
  attribution?: SessionAttribution;
}

/**
 * Computes a complete, deterministic FormAnalyticsReport from form schema,
 * stored FormResponseRecords, and behavioral AnalyticsEvents.
 *
 * Metric Definitions:
 * - Form Views: Unique sessions with a `form_view` (or `form_start`) event.
 * - Form Starts: Unique sessions with a `form_start` (or `question_view` / `question_answered`) event.
 * - Completed Tracked Sessions: Unique sessions with a `form_complete` event.
 * - Total Submissions: Stored FormResponseRecord count for this form.
 * - Historical Pre-Analytics Submissions: Submissions without a matching tracked session.
 *   Views and starts are NEVER fabricated for historical submissions.
 * - View-to-Start Conversion = (Form Starts / Form Views) * 100 (null when Form Views == 0).
 * - Start-to-Completion Conversion = (Completed Tracked Sessions / Form Starts) * 100 (null when Form Starts == 0).
 * - Overall View-to-Completion Conversion = (Completed Tracked Sessions / Form Views) * 100 (null when Form Views == 0).
 */
export function computeFormAnalyticsReport(
  form: FormSchema,
  allResponses: FormResponseRecord[],
  allEvents: AnalyticsEvent[],
  filters: AnalyticsFilterOptions = {}
): FormAnalyticsReport {
  const dateRange = filters.dateRange || 'all';
  const nowMs = filters.nowMs ?? Date.now();
  const incompleteWindowMs =
    filters.incompleteWindowMs ?? DEFAULT_INCOMPLETE_WINDOW_MS;

  const formEventsAll = deduplicateAnalyticsEvents(
    allEvents.filter((e) => e.formId === form.id)
  );
  const formResponsesAll = allResponses.filter((r) => r.formId === form.id);

  // Collect available filter values across all events and responses for this form
  const sourceSet = new Set<string>();
  const mediumSet = new Set<string>();
  const campaignSet = new Set<string>();

  for (const ev of formEventsAll) {
    const u = ev.attribution?.utm;
    sourceSet.add(u?.utm_source || 'Direct / Unknown');
    mediumSet.add(u?.utm_medium || 'Direct / Unknown');
    campaignSet.add(u?.utm_campaign || 'Direct / Unknown');
  }
  for (const resp of formResponsesAll) {
    const u = resp.attribution?.utm;
    sourceSet.add(u?.utm_source || 'Direct / Unknown');
    mediumSet.add(u?.utm_medium || 'Direct / Unknown');
    campaignSet.add(u?.utm_campaign || 'Direct / Unknown');
  }

  // Group events by sessionId first so session attribution is resolved from session entry
  const sessionsMap = new Map<string, AggregatedSessionState>();
  const sortedEvents = [...formEventsAll].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const ev of sortedEvents) {
    let sess = sessionsMap.get(ev.sessionId);
    if (!sess) {
      sess = {
        sessionId: ev.sessionId,
        firstTimestamp: ev.timestamp,
        lastTimestamp: ev.timestamp,
        hasView: false,
        hasStart: false,
        hasComplete: false,
        hasExplicitExit: false,
        lastQuestionId: null,
        viewedQuestionIds: new Set<string>(),
        answeredQuestionIds: new Set<string>(),
        questionDurationsMs: new Map<string, number>(),
        validationErrorsByQuestion: new Map<string, number>(),
        transitions: [],
        completionDurationSeconds: null,
        attribution: ev.attribution,
      };
      sessionsMap.set(ev.sessionId, sess);
    }

    sess.lastTimestamp = ev.timestamp;
    if (!sess.attribution && ev.attribution) {
      sess.attribution = ev.attribution;
    }

    if (ev.type === 'form_view') {
      sess.hasView = true;
    } else if (ev.type === 'form_start') {
      sess.hasView = true;
      sess.hasStart = true;
    } else if (ev.type === 'question_view') {
      sess.hasView = true;
      sess.hasStart = true;
      if (ev.questionId) {
        sess.viewedQuestionIds.add(ev.questionId);
        sess.lastQuestionId = ev.questionId;
      }
    } else if (ev.type === 'question_answered') {
      sess.hasView = true;
      sess.hasStart = true;
      if (ev.questionId) {
        sess.viewedQuestionIds.add(ev.questionId);
        sess.answeredQuestionIds.add(ev.questionId);
        sess.lastQuestionId = ev.questionId;
        if (typeof ev.activeDurationMs === 'number' && ev.activeDurationMs > 0) {
          const prevDur = sess.questionDurationsMs.get(ev.questionId) || 0;
          sess.questionDurationsMs.set(ev.questionId, prevDur + ev.activeDurationMs);
        }
        if (ev.targetNodeId) {
          sess.transitions.push({
            sourceId: ev.questionId,
            targetId: ev.targetNodeId,
            ruleId: ev.ruleId,
          });
        }
      }
    } else if (ev.type === 'validation_error') {
      if (ev.questionId) {
        sess.viewedQuestionIds.add(ev.questionId);
        const prevErr = sess.validationErrorsByQuestion.get(ev.questionId) || 0;
        sess.validationErrorsByQuestion.set(ev.questionId, prevErr + 1);
      }
    } else if (ev.type === 'question_exit') {
      sess.hasExplicitExit = true;
      if (ev.questionId) {
        sess.lastQuestionId = ev.questionId;
        if (typeof ev.activeDurationMs === 'number' && ev.activeDurationMs > 0) {
          const prevDur = sess.questionDurationsMs.get(ev.questionId) || 0;
          sess.questionDurationsMs.set(ev.questionId, prevDur + ev.activeDurationMs);
        }
      }
    } else if (ev.type === 'form_complete') {
      sess.hasView = true;
      sess.hasStart = true;
      sess.hasComplete = true;
      if (typeof ev.activeDurationMs === 'number' && ev.activeDurationMs > 0) {
        sess.completionDurationSeconds = Math.max(
          1,
          Math.round(ev.activeDurationMs / 1000)
        );
      }
    }
  }

  // Filter sessions and responses by dateRange and attribution filters
  const filteredSessions = Array.from(sessionsMap.values()).filter(
    (sess) =>
      isWithinDateRange(sess.firstTimestamp, dateRange, nowMs) &&
      matchesAttributionFilters(sess.attribution, filters)
  );

  const filteredResponses = formResponsesAll.filter(
    (resp) =>
      isWithinDateRange(resp.submittedAt, dateRange, nowMs) &&
      matchesAttributionFilters(resp.attribution, filters)
  );

  const trackedSessionIds = new Set(filteredSessions.map((s) => s.sessionId));

  let formViews = 0;
  let formStarts = 0;
  let completedTrackedSessions = 0;
  let incompleteSessions = 0;
  let activeSessions = 0;

  for (const sess of filteredSessions) {
    if (sess.hasView) formViews++;
    if (sess.hasStart) formStarts++;
    if (sess.hasComplete) {
      completedTrackedSessions++;
    } else if (sess.hasView || sess.hasStart) {
      const lastTs = new Date(sess.lastTimestamp).getTime();
      const isTimedOut =
        !Number.isNaN(lastTs) && nowMs - lastTs >= incompleteWindowMs;
      if (sess.hasExplicitExit || isTimedOut) {
        incompleteSessions++;
      } else {
        activeSessions++;
      }
    }
  }

  const historicalPreAnalyticsSubmissions = filteredResponses.filter(
    (r) => !r.sessionId || !trackedSessionIds.has(r.sessionId)
  ).length;

  const totalSubmissions = filteredResponses.length;

  const viewToStartRate =
    formViews > 0 ? Number(((formStarts / formViews) * 100).toFixed(1)) : null;
  const startToCompletionRate =
    formStarts > 0
      ? Number(((completedTrackedSessions / formStarts) * 100).toFixed(1))
      : null;
  const viewToCompletionRate =
    formViews > 0
      ? Number(((completedTrackedSessions / formViews) * 100).toFixed(1))
      : null;

  // Completion durations from submissions (and completed sessions if any submission was deleted)
  const durationSamples: number[] = [];
  const countedResponseSessionIds = new Set<string>();
  for (const resp of filteredResponses) {
    if (
      typeof resp.durationSeconds === 'number' &&
      Number.isFinite(resp.durationSeconds) &&
      resp.durationSeconds > 0
    ) {
      durationSamples.push(resp.durationSeconds);
      if (resp.sessionId) countedResponseSessionIds.add(resp.sessionId);
    }
  }
  for (const sess of filteredSessions) {
    if (
      sess.hasComplete &&
      sess.completionDurationSeconds !== null &&
      !countedResponseSessionIds.has(sess.sessionId)
    ) {
      durationSamples.push(sess.completionDurationSeconds);
    }
  }

  const avgCompletionSeconds =
    durationSamples.length > 0
      ? Math.round(
          durationSamples.reduce((a, b) => a + b, 0) / durationSamples.length
        )
      : null;
  const medianCompletionSeconds = computeMedian(durationSamples);

  // Daily Activity Trends
  const dailyBucketsMap = new Map<
    string,
    { views: number; starts: number; completions: number; submissions: number }
  >();

  const ensureDateBucket = (dateKey: string) => {
    if (!dailyBucketsMap.has(dateKey)) {
      dailyBucketsMap.set(dateKey, {
        views: 0,
        starts: 0,
        completions: 0,
        submissions: 0,
      });
    }
    return dailyBucketsMap.get(dateKey)!;
  };

  for (const sess of filteredSessions) {
    const dk = formatDateKey(sess.firstTimestamp);
    if (dk === 'Unknown') continue;
    const b = ensureDateBucket(dk);
    if (sess.hasView) b.views++;
    if (sess.hasStart) b.starts++;
    if (sess.hasComplete) b.completions++;
  }

  for (const resp of filteredResponses) {
    const dk = formatDateKey(resp.submittedAt);
    if (dk === 'Unknown') continue;
    const b = ensureDateBucket(dk);
    b.submissions++;
  }

  const dailyTrends: DailyActivityPoint[] = Array.from(dailyBucketsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, counts]) => ({
      dateKey,
      label: formatShortDateLabel(dateKey),
      ...counts,
    }));

  // Question-level & Flow Overlay Analytics
  const nodeVisits: Record<string, number> = {
    welcome: formViews,
    completion: Math.max(completedTrackedSessions, totalSubmissions),
  };

  const edgeTraversalCounts = new Map<
    string,
    {
      edgeId: string;
      sourceNodeId: string;
      targetNodeId: string;
      ruleId?: string;
      count: number;
    }
  >();

  const recordEdgeHit = (
    sourceId: string,
    targetId: string,
    ruleId?: string
  ) => {
    const edgeId =
      ruleId && ruleId !== 'default'
        ? `edge_rule_${sourceId}_${ruleId}`
        : `edge_default_${sourceId}`;
    const existing = edgeTraversalCounts.get(edgeId);
    if (existing) {
      existing.count++;
    } else {
      edgeTraversalCounts.set(edgeId, {
        edgeId,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        ruleId,
        count: 1,
      });
    }
  };

  // Record transitions from tracked sessions
  const sessionsWithTransitions = new Set<string>();
  for (const sess of filteredSessions) {
    if (sess.transitions.length > 0) {
      sessionsWithTransitions.add(sess.sessionId);
      if (form.welcomeScreen.enabled && form.questions[0]) {
        recordEdgeHit('welcome', form.questions[0].id);
      }
      for (const tr of sess.transitions) {
        recordEdgeHit(tr.sourceId, tr.targetId, tr.ruleId);
      }
    }
  }

  // Also include path transitions from historical/stored submissions that didn't have session transition events
  for (const resp of filteredResponses) {
    if (resp.sessionId && sessionsWithTransitions.has(resp.sessionId)) {
      continue;
    }
    if (form.welcomeScreen.enabled && form.questions[0]) {
      recordEdgeHit('welcome', form.questions[0].id);
    }
    const visited = resp.visitedQuestionIds || Object.keys(resp.answers);
    for (const qId of visited) {
      const q = form.questions.find((item) => item.id === qId);
      if (!q) continue;
      const ans = resp.answers[qId];
      const nextId = resolveNextNodeId(form, qId, resp.answers);
      const rId = resolveTriggeredBranchRuleId(q, ans);
      recordEdgeHit(qId, nextId, rId);
    }
  }

  const questionsMetrics: QuestionAnalyticsMetrics[] = form.questions.map(
    (q, qIdx) => {
      // Sessions that viewed or answered this question
      let sessionReachedCount = 0;
      let sessionAnsweredCount = 0;
      let exitCount = 0;
      let validationErrorCount = 0;
      let validationErrorSessions = 0;
      const durationMsList: number[] = [];

      for (const sess of filteredSessions) {
        const reached =
          sess.viewedQuestionIds.has(q.id) || sess.answeredQuestionIds.has(q.id);
        if (reached) sessionReachedCount++;
        if (sess.answeredQuestionIds.has(q.id)) sessionAnsweredCount++;

        const dur = sess.questionDurationsMs.get(q.id);
        if (typeof dur === 'number' && dur > 0) {
          durationMsList.push(dur);
        }

        const errCount = sess.validationErrorsByQuestion.get(q.id) || 0;
        if (errCount > 0) {
          validationErrorCount += errCount;
          validationErrorSessions++;
        }

        const lastTs = new Date(sess.lastTimestamp).getTime();
        const isIncomplete =
          !sess.hasComplete &&
          (sess.hasExplicitExit ||
            (!Number.isNaN(lastTs) && nowMs - lastTs >= incompleteWindowMs));
        if (isIncomplete && sess.lastQuestionId === q.id) {
          exitCount++;
        }
      }

      // Submissions that visited or answered this question (including historical pre-analytics submissions)
      let historicalReached = 0;
      const validAnswerValues: AnswerValue[] = [];
      let submissionAnsweredCount = 0;

      for (const resp of filteredResponses) {
        const isPreAnalytics =
          !resp.sessionId || !trackedSessionIds.has(resp.sessionId);
        const visitedSet = new Set(
          resp.visitedQuestionIds || Object.keys(resp.answers)
        );
        const val = resp.answers[q.id];
        const hasNonEmptyAnswer =
          val !== null &&
          val !== undefined &&
          !(typeof val === 'string' && val.trim() === '') &&
          !(Array.isArray(val) && val.length === 0);

        if (isPreAnalytics && (visitedSet.has(q.id) || hasNonEmptyAnswer)) {
          historicalReached++;
        }
        if (hasNonEmptyAnswer) {
          submissionAnsweredCount++;
          validAnswerValues.push(val);
        }
      }

      const reachedCount = Math.max(
        sessionReachedCount + historicalReached,
        submissionAnsweredCount
      );
      const answeredCount = Math.max(
        sessionAnsweredCount,
        submissionAnsweredCount
      );

      // Skipped count: respondents who reached the question or completed the form without answering this question
      const totalEligibleCompletions = Math.max(
        completedTrackedSessions + historicalPreAnalyticsSubmissions,
        totalSubmissions
      );
      const skippedCount = Math.max(
        0,
        Math.max(reachedCount, totalEligibleCompletions) - answeredCount - exitCount
      );

      nodeVisits[q.id] = reachedCount;

      const dropOffRate =
        reachedCount > 0
          ? Number(((exitCount / reachedCount) * 100).toFixed(1))
          : 0;

      const avgTimeSpentSeconds =
        durationMsList.length > 0
          ? Number(
              (
                durationMsList.reduce((a, b) => a + b, 0) /
                durationMsList.length /
                1000
              ).toFixed(1)
            )
          : null;

      // Type-specific distributions (never exposing raw free-text or email in aggregate metrics)
      let choiceDistribution: QuestionChoiceDistributionItem[] | undefined;
      let ratingMetrics: QuestionAnalyticsMetrics['ratingMetrics'];
      let numericMetrics: NumericSummaryMetrics | undefined;
      let textPrivacyMetrics: TextPrivacySummaryMetrics | undefined;
      let dateMetrics: DateSummaryMetrics | undefined;

      if (
        q.type === 'single_choice' ||
        q.type === 'multiple_choice' ||
        q.type === 'dropdown' ||
        q.type === 'yes_no'
      ) {
        const options =
          q.type === 'yes_no'
            ? [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ]
            : q.choices || [];

        const countsMap = new Map<string, number>();
        options.forEach((opt) => countsMap.set(opt.id, 0));

        for (const val of validAnswerValues) {
          const tokens = Array.isArray(val) ? val : [val];
          for (const tok of tokens) {
            const str = String(tok).trim().toLowerCase();
            const matched = options.find(
              (o) =>
                o.id.toLowerCase() === str || o.label.toLowerCase() === str
            );
            if (matched) {
              countsMap.set(matched.id, (countsMap.get(matched.id) || 0) + 1);
            }
          }
        }

        choiceDistribution = options.map((opt) => {
          const count = countsMap.get(opt.id) || 0;
          return {
            id: opt.id,
            label: opt.label,
            count,
            percentage:
              validAnswerValues.length > 0
                ? Math.round((count / validAnswerValues.length) * 100)
                : 0,
          };
        });
      } else if (q.type === 'rating') {
        const maxRating = q.maxRating || 5;
        const nums = validAnswerValues
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= maxRating);

        const average =
          nums.length > 0
            ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1))
            : null;
        const median = computeMedianFloat(nums);

        const distribution: QuestionChoiceDistributionItem[] = Array.from(
          { length: maxRating },
          (_, idx) => {
            const score = idx + 1;
            const count = nums.filter((n) => Math.round(n) === score).length;
            return {
              id: `rating_${score}`,
              label: `${score} ★`,
              count,
              percentage:
                nums.length > 0 ? Math.round((count / nums.length) * 100) : 0,
            };
          }
        );

        ratingMetrics = {
          maxRating,
          average,
          median,
          distribution,
        };
      } else if (q.type === 'number') {
        const nums = validAnswerValues
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n));

        if (nums.length > 0) {
          const min = Math.min(...nums);
          const max = Math.max(...nums);
          const average = Number(
            (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)
          );
          const median = computeMedianFloat(nums) ?? average;

          // Build compact value buckets
          const uniqueVals = Array.from(new Set(nums)).sort((a, b) => a - b);
          const buckets =
            uniqueVals.length <= 5
              ? uniqueVals.map((val) => {
                  const count = nums.filter((n) => n === val).length;
                  return {
                    label: String(val),
                    count,
                    percentage: Math.round((count / nums.length) * 100),
                  };
                })
              : [
                  {
                    label: `${min} – ${Math.round(min + (max - min) / 2)}`,
                    count: nums.filter(
                      (n) => n <= Math.round(min + (max - min) / 2)
                    ).length,
                    percentage: Math.round(
                      (nums.filter((n) => n <= Math.round(min + (max - min) / 2))
                        .length /
                        nums.length) *
                        100
                    ),
                  },
                  {
                    label: `${Math.round(min + (max - min) / 2) + 1} – ${max}`,
                    count: nums.filter(
                      (n) => n > Math.round(min + (max - min) / 2)
                    ).length,
                    percentage: Math.round(
                      (nums.filter((n) => n > Math.round(min + (max - min) / 2))
                        .length /
                        nums.length) *
                        100
                    ),
                  },
                ];

          numericMetrics = {
            min,
            max,
            average,
            median,
            buckets,
          };
        }
      } else if (
        q.type === 'short_text' ||
        q.type === 'long_text' ||
        q.type === 'email'
      ) {
        let shortCount = 0;
        let mediumCount = 0;
        let longCount = 0;
        const domains = new Set<string>();

        for (const val of validAnswerValues) {
          const str = String(val).trim();
          if (str.length < 25) shortCount++;
          else if (str.length <= 100) mediumCount++;
          else longCount++;

          if (q.type === 'email' && str.includes('@')) {
            const dom = str.split('@')[1]?.toLowerCase().trim();
            if (dom) domains.add(dom);
          }
        }

        textPrivacyMetrics = {
          totalResponses: validAnswerValues.length,
          shortCount,
          mediumCount,
          longCount,
          ...(q.type === 'email'
            ? { validEmailDomainCount: domains.size }
            : {}),
        };
      } else if (q.type === 'date') {
        const validDates = validAnswerValues
          .map((v) => String(v).trim())
          .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
          .sort();

        dateMetrics = {
          earliestDate: validDates[0] || null,
          latestDate: validDates[validDates.length - 1] || null,
          distinctDatesCount: new Set(validDates).size,
        };
      }

      return {
        questionId: q.id,
        questionIndex: qIdx + 1,
        questionTitle: q.title,
        questionType: q.type,
        required: q.required,
        reachedCount,
        answeredCount,
        skippedCount,
        exitCount,
        dropOffRate,
        avgTimeSpentSeconds,
        validationErrorCount,
        validationErrorSessions,
        ...(choiceDistribution ? { choiceDistribution } : {}),
        ...(ratingMetrics ? { ratingMetrics } : {}),
        ...(numericMetrics ? { numericMetrics } : {}),
        ...(textPrivacyMetrics ? { textPrivacyMetrics } : {}),
        ...(dateMetrics ? { dateMetrics } : {}),
      };
    }
  );

  // Finalize flowOverlay edge percentages relative to source node visits
  const edgeTraversals: FlowOverlayAnalytics['edgeTraversals'] = {};
  for (const [edgeId, entry] of edgeTraversalCounts.entries()) {
    const sourceTotal = Math.max(1, nodeVisits[entry.sourceNodeId] || entry.count);
    edgeTraversals[edgeId] = {
      ...entry,
      percentageOfSource: Math.min(
        100,
        Math.round((entry.count / sourceTotal) * 100)
      ),
    };
  }

  // Question Funnel
  const initialFunnelBase = Math.max(
    formViews,
    questionsMetrics[0]?.reachedCount || 0,
    totalSubmissions
  );
  const funnel: FunnelStepMetric[] = [];

  if (form.welcomeScreen.enabled) {
    funnel.push({
      stepId: 'welcome',
      label: 'Form View (Welcome Screen)',
      kind: 'view',
      sessionCount: initialFunnelBase,
      conversionFromPrevious: 100,
      conversionFromInitial: initialFunnelBase > 0 ? 100 : null,
      dropOffCount: Math.max(
        0,
        initialFunnelBase - Math.max(formStarts, questionsMetrics[0]?.reachedCount || 0)
      ),
    });
  }

  let prevStepCount = initialFunnelBase;
  for (const qm of questionsMetrics) {
    const convPrev =
      prevStepCount > 0
        ? Math.min(100, Math.round((qm.reachedCount / prevStepCount) * 100))
        : null;
    const convInit =
      initialFunnelBase > 0
        ? Math.min(100, Math.round((qm.reachedCount / initialFunnelBase) * 100))
        : null;

    funnel.push({
      stepId: qm.questionId,
      label: `Q${String(qm.questionIndex).padStart(2, '0')} · ${qm.questionTitle}`,
      kind: 'question',
      sessionCount: qm.reachedCount,
      conversionFromPrevious: convPrev,
      conversionFromInitial: convInit,
      dropOffCount: qm.exitCount,
    });
    prevStepCount = Math.max(qm.reachedCount, 1);
  }

  const finalCompletedCount = Math.max(
    completedTrackedSessions + historicalPreAnalyticsSubmissions,
    totalSubmissions
  );
  funnel.push({
    stepId: 'completion',
    label: 'Completed Submission',
    kind: 'complete',
    sessionCount: finalCompletedCount,
    conversionFromPrevious:
      prevStepCount > 0
        ? Math.min(100, Math.round((finalCompletedCount / prevStepCount) * 100))
        : null,
    conversionFromInitial:
      initialFunnelBase > 0
        ? Math.min(
            100,
            Math.round((finalCompletedCount / initialFunnelBase) * 100)
          )
        : null,
    dropOffCount: 0,
  });

  // Acquisition Breakdown Builder
  const buildDimensionBreakdown = (
    extractor: (attr?: SessionAttribution) => {
      label: string;
      isDirectOrUnknown: boolean;
    }
  ): AttributionBreakdownRow[] => {
    const groups = new Map<
      string,
      {
        label: string;
        isDirectOrUnknown: boolean;
        views: number;
        starts: number;
        completions: number;
        submissions: number;
        durations: number[];
        countedSubmissionSessionIds: Set<string>;
      }
    >();

    const getBucket = (attr?: SessionAttribution) => {
      const { label, isDirectOrUnknown } = extractor(attr);
      const key = isDirectOrUnknown ? '__direct_unknown__' : label.toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, {
          label,
          isDirectOrUnknown,
          views: 0,
          starts: 0,
          completions: 0,
          submissions: 0,
          durations: [],
          countedSubmissionSessionIds: new Set<string>(),
        });
      }
      return groups.get(key)!;
    };

    for (const sess of filteredSessions) {
      const b = getBucket(sess.attribution);
      if (sess.hasView) b.views++;
      if (sess.hasStart) b.starts++;
      if (sess.hasComplete) {
        b.completions++;
        if (sess.completionDurationSeconds !== null) {
          b.durations.push(sess.completionDurationSeconds);
          b.countedSubmissionSessionIds.add(sess.sessionId);
        }
      }
    }

    for (const resp of filteredResponses) {
      const b = getBucket(resp.attribution);
      b.submissions++;
      if (
        typeof resp.durationSeconds === 'number' &&
        resp.durationSeconds > 0 &&
        (!resp.sessionId || !b.countedSubmissionSessionIds.has(resp.sessionId))
      ) {
        b.durations.push(resp.durationSeconds);
      }
    }

    return Array.from(groups.entries())
      .map(([key, g]) => ({
        key,
        label: g.label,
        isDirectOrUnknown: g.isDirectOrUnknown,
        views: g.views,
        starts: g.starts,
        completions: g.completions,
        submissions: g.submissions,
        viewToCompletionRate:
          g.views > 0
            ? Number(((g.completions / g.views) * 100).toFixed(1))
            : null,
        startToCompletionRate:
          g.starts > 0
            ? Number(((g.completions / g.starts) * 100).toFixed(1))
            : null,
        avgCompletionSeconds:
          g.durations.length > 0
            ? Math.round(
                g.durations.reduce((a, b) => a + b, 0) / g.durations.length
              )
            : null,
      }))
      .sort((a, b) => {
        if (b.views !== a.views) return b.views - a.views;
        return b.submissions - a.submissions;
      });
  };

  const extractUtmField =
    (field: keyof UtmAttribution) => (attr?: SessionAttribution) => {
      const val = attr?.utm?.[field];
      if (!val) {
        return { label: 'Direct / Unknown', isDirectOrUnknown: true };
      }
      return { label: val, isDirectOrUnknown: false };
    };

  const bySource = buildDimensionBreakdown(extractUtmField('utm_source'));
  const byMedium = buildDimensionBreakdown(extractUtmField('utm_medium'));
  const byCampaign = buildDimensionBreakdown(extractUtmField('utm_campaign'));
  const byContent = buildDimensionBreakdown(extractUtmField('utm_content'));
  const byTerm = buildDimensionBreakdown(extractUtmField('utm_term'));
  const byReferrer = buildDimensionBreakdown((attr?: SessionAttribution) => {
    const ref = attr?.referrerOrigin;
    if (!ref) {
      return { label: 'Direct / Unknown', isDirectOrUnknown: true };
    }
    return { label: ref, isDirectOrUnknown: false };
  });

  let directOrUnknownViews = 0;
  let attributedViews = 0;
  for (const sess of filteredSessions) {
    if (!sess.hasView) continue;
    const isDirect =
      !sess.attribution ||
      sess.attribution.isDirectOrUnknown ||
      (!hasAnyUtmParameter(sess.attribution.utm) &&
        !sess.attribution.referrerOrigin);
    if (isDirect) directOrUnknownViews++;
    else attributedViews++;
  }

  let directOrUnknownSubmissions = 0;
  let attributedSubmissions = 0;
  for (const resp of filteredResponses) {
    const isDirect =
      !resp.attribution ||
      resp.attribution.isDirectOrUnknown ||
      (!hasAnyUtmParameter(resp.attribution.utm) &&
        !resp.attribution.referrerOrigin);
    if (isDirect) directOrUnknownSubmissions++;
    else attributedSubmissions++;
  }

  // Campaign Performance Over Time
  const campaignTrendMap = new Map<
    string,
    Record<string, { views: number; completions: number }>
  >();

  for (const sess of filteredSessions) {
    const dk = formatDateKey(sess.firstTimestamp);
    if (dk === 'Unknown') continue;
    const camp = sess.attribution?.utm?.utm_campaign || 'Direct / Unknown';
    if (!campaignTrendMap.has(dk)) {
      campaignTrendMap.set(dk, {});
    }
    const dayEntry = campaignTrendMap.get(dk)!;
    if (!dayEntry[camp]) {
      dayEntry[camp] = { views: 0, completions: 0 };
    }
    if (sess.hasView) dayEntry[camp].views++;
    if (sess.hasComplete) dayEntry[camp].completions++;
  }

  for (const resp of filteredResponses) {
    const isPreAnalytics =
      !resp.sessionId || !trackedSessionIds.has(resp.sessionId);
    if (!isPreAnalytics) continue;
    const dk = formatDateKey(resp.submittedAt);
    if (dk === 'Unknown') continue;
    const camp = resp.attribution?.utm?.utm_campaign || 'Direct / Unknown';
    if (!campaignTrendMap.has(dk)) {
      campaignTrendMap.set(dk, {});
    }
    const dayEntry = campaignTrendMap.get(dk)!;
    if (!dayEntry[camp]) {
      dayEntry[camp] = { views: 0, completions: 0 };
    }
    dayEntry[camp].completions++;
  }

  const campaignTrends: CampaignTrendPoint[] = Array.from(
    campaignTrendMap.entries()
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, byCamp]) => ({
      dateKey,
      label: formatShortDateLabel(dateKey),
      byCampaign: byCamp,
    }));

  // Source Comparison: Question-level completion behavior across sources
  const sourceGroups = new Map<
    string,
    {
      sourceLabel: string;
      sessions: AggregatedSessionState[];
      preAnalyticsResponses: FormResponseRecord[];
    }
  >();

  const ensureSourceGroup = (sourceLabel: string) => {
    const key = sourceLabel.toLowerCase();
    if (!sourceGroups.has(key)) {
      sourceGroups.set(key, {
        sourceLabel,
        sessions: [],
        preAnalyticsResponses: [],
      });
    }
    return sourceGroups.get(key)!;
  };

  for (const sess of filteredSessions) {
    const src = sess.attribution?.utm?.utm_source || 'Direct / Unknown';
    ensureSourceGroup(src).sessions.push(sess);
  }
  for (const resp of filteredResponses) {
    const isPreAnalytics =
      !resp.sessionId || !trackedSessionIds.has(resp.sessionId);
    if (!isPreAnalytics) continue;
    const src = resp.attribution?.utm?.utm_source || 'Direct / Unknown';
    ensureSourceGroup(src).preAnalyticsResponses.push(resp);
  }

  const sourceQuestionComparison: SourceQuestionComparisonRow[] = Array.from(
    sourceGroups.values()
  )
    .map((grp) => {
      const totalSessionsOrSubmissions =
        grp.sessions.length + grp.preAnalyticsResponses.length;
      const questionCompletionRates: SourceQuestionComparisonRow['questionCompletionRates'] =
        {};

      for (const q of form.questions) {
        let reached = 0;
        let answered = 0;

        for (const s of grp.sessions) {
          if (s.viewedQuestionIds.has(q.id) || s.answeredQuestionIds.has(q.id)) {
            reached++;
          }
          if (s.answeredQuestionIds.has(q.id)) {
            answered++;
          }
        }
        for (const r of grp.preAnalyticsResponses) {
          const visited = new Set(
            r.visitedQuestionIds || Object.keys(r.answers)
          );
          const val = r.answers[q.id];
          const hasAns =
            val !== null &&
            val !== undefined &&
            !(typeof val === 'string' && val.trim() === '') &&
            !(Array.isArray(val) && val.length === 0);
          if (visited.has(q.id) || hasAns) reached++;
          if (hasAns) answered++;
        }

        questionCompletionRates[q.id] = {
          reached,
          answered,
          completionRate:
            reached > 0 ? Math.round((answered / reached) * 100) : 0,
        };
      }

      return {
        sourceLabel: grp.sourceLabel,
        totalSessionsOrSubmissions,
        questionCompletionRates,
      };
    })
    .sort(
      (a, b) => b.totalSessionsOrSubmissions - a.totalSessionsOrSubmissions
    );

  return {
    formId: form.id,
    overview: {
      formViews,
      formStarts,
      completedTrackedSessions,
      totalSubmissions,
      historicalPreAnalyticsSubmissions,
      incompleteSessions,
      activeSessions,
      viewToStartRate,
      startToCompletionRate,
      viewToCompletionRate,
      avgCompletionSeconds,
      medianCompletionSeconds,
      hasTrackedBehavioralEvents: formEventsAll.length > 0,
      dailyTrends,
    },
    questions: questionsMetrics,
    funnel,
    flowOverlay: {
      nodeVisits,
      edgeTraversals,
    },
    acquisition: {
      bySource,
      byMedium,
      byCampaign,
      byContent,
      byTerm,
      byReferrer,
      directOrUnknownViews,
      directOrUnknownSubmissions,
      attributedViews,
      attributedSubmissions,
      availableSources: Array.from(sourceSet).sort(),
      availableMediums: Array.from(mediumSet).sort(),
      availableCampaigns: Array.from(campaignSet).sort(),
      campaignTrends,
      sourceQuestionComparison,
    },
  };
}

/**
 * Escapes a single CSV cell per RFC 4180 and neutralizes spreadsheet formula injection
 * (cells starting with =, +, -, @, tab, or carriage return).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Prevent CSV/spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (
    str.includes('"') ||
    str.includes(',') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports form submissions to RFC 4180 CSV format, including submission metadata,
 * UTM attribution parameters, referrer origin, viewport category, form revision,
 * and resolved historical answers.
 */
export function exportSubmissionsToCsv(
  form: FormSchema,
  responses: FormResponseRecord[],
  revisions: FormRevisionSnapshot[] = []
): string {
  const formResponses = responses
    .filter((r) => r.formId === form.id)
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

  // Collect all question columns (current form questions + any archived questions in historical snapshots)
  const questionColumns: Array<{ id: string; title: string }> =
    form.questions.map((q, idx) => ({
      id: q.id,
      title: `Q${String(idx + 1).padStart(2, '0')}: ${q.title}`,
    }));
  const seenQuestionIds = new Set(questionColumns.map((q) => q.id));

  for (const resp of formResponses) {
    const resolved = resolveHistoricalSubmissionItems(form, resp, revisions);
    for (const item of resolved) {
      if (!seenQuestionIds.has(item.questionId)) {
        seenQuestionIds.add(item.questionId);
        questionColumns.push({
          id: item.questionId,
          title: `[Archived] ${item.questionTitle}`,
        });
      }
    }
  }

  const headers = [
    'Submission ID',
    'Submitted At',
    'Duration (s)',
    'Form Revision',
    'Viewport',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'UTM Content',
    'UTM Term',
    'Referrer Origin',
    ...questionColumns.map((col) => col.title),
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const resp of formResponses) {
    const resolved = resolveHistoricalSubmissionItems(form, resp, revisions);
    const answerByQuestionId = new Map<string, string>();
    for (const item of resolved) {
      answerByQuestionId.set(item.questionId, item.displayAnswer || '');
    }

    const utm = resp.attribution?.utm;
    const rowCells = [
      resp.id,
      resp.submittedAt,
      resp.durationSeconds ?? '',
      `v${resp.formRevision || 1}`,
      resp.viewport || 'unknown',
      utm?.utm_source || '',
      utm?.utm_medium || '',
      utm?.utm_campaign || '',
      utm?.utm_content || '',
      utm?.utm_term || '',
      resp.attribution?.referrerOrigin || '',
      ...questionColumns.map((col) => answerByQuestionId.get(col.id) || ''),
    ];

    rows.push(rowCells.map(escapeCsvCell).join(','));
  }

  return rows.join('\n');
}

/**
 * Exports filtered or complete form submissions to a clean, portable JSON payload.
 */
export function exportSubmissionsToJson(
  form: FormSchema,
  responses: FormResponseRecord[],
  revisions: FormRevisionSnapshot[] = []
): string {
  const formResponses = responses
    .filter((r) => r.formId === form.id)
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

  const enriched = formResponses.map((resp) => ({
    ...resp,
    resolvedItems: resolveHistoricalSubmissionItems(form, resp, revisions),
  }));

  return JSON.stringify(
    {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      formId: form.id,
      formTitle: form.title,
      currentRevision: form.revision || 1,
      submissionCount: enriched.length,
      submissions: enriched,
    },
    null,
    2
  );
}
