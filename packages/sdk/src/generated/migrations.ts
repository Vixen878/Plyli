// Generated from Plyli core/migrations.ts; run pnpm sdk:sync in Plyli.
import {
  CURRENT_SCHEMA_VERSION,
  FormSchema,
  FormQuestion,
  QuestionType,
  LogicOperator,
  LogicRule,
  FormResponseRecord,
  FormRevisionSnapshot,
  WorkspaceBackupPayload,
  AppearanceTemplateId,
  AppearanceOverrides,
  FontFamilyToken,
  ButtonShapeToken,
  CornerRadiusToken,
  BackgroundTreatmentToken,
  CardWidthToken,
  ContentAlignmentToken,
  ButtonShadowToken,
  SpacingDensityToken,
  generateId,
} from './types.js';
import { normalizeQuestionAnswer } from './submissions.js';
import { sanitizeSessionAttribution, ViewportCategory } from './attribution.js';
import {
  AnalyticsEvent,
  AnalyticsSessionSource,
  deduplicateAnalyticsEvents,
  VALID_VIEWPORT_CATEGORIES,
  VALID_SESSION_SOURCES,
} from './analytics.js';

const VALID_TEMPLATE_IDS = new Set<AppearanceTemplateId>([
  'paper',
  'canvas',
  'editorial',
  'pop',
  'after-dark',
  'bloom',
  'breeze',
  'corporate',
  'gaming',
  'blueprint',
  'terracotta',
  'vamori',
  'veritas',
  'tiny-et',
  'akarii',
  'riff',
]);

const VALID_QUESTION_TYPES = new Set<QuestionType>([
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
]);

const VALID_LOGIC_OPERATORS = new Set<LogicOperator>([
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'is_answered',
]);

const VALID_FONT_FAMILIES = new Set<FontFamilyToken>([
  'display',
  'sans',
  'serif',
  'mono',
]);
const VALID_BUTTON_SHAPES = new Set<ButtonShapeToken>([
  'rounded',
  'pill',
  'sharp',
]);
const VALID_CORNER_RADII = new Set<CornerRadiusToken>(['sm', 'md', 'lg', 'xl']);
const VALID_BG_TREATMENTS = new Set<BackgroundTreatmentToken>([
  'solid',
  'paper-grain',
  'subtle-grid',
  'soft-gradient',
]);
const VALID_CARD_WIDTHS = new Set<CardWidthToken>([
  'compact',
  'standard',
  'wide',
]);
const VALID_ALIGNMENTS = new Set<ContentAlignmentToken>(['left', 'center']);
const VALID_SHADOWS = new Set<ButtonShadowToken>(['tactile', 'soft', 'none']);
const VALID_DENSITIES = new Set<SpacingDensityToken>([
  'compact',
  'comfortable',
  'spacious',
]);

const SAFE_HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isValidAppearanceTemplateId(
  id: unknown
): id is AppearanceTemplateId {
  return (
    typeof id === 'string' &&
    VALID_TEMPLATE_IDS.has(id as AppearanceTemplateId)
  );
}

export function isSafeHexColor(val: unknown): val is string {
  return typeof val === 'string' && SAFE_HEX_COLOR_REGEX.test(val.trim());
}

/**
 * Recursively strips prototype-pollution keys (__proto__, constructor, prototype)
 * from parsed JSON objects before schema migration.
 */
export function sanitizeUntrustedJson<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUntrustedJson(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    clean[k] = sanitizeUntrustedJson(v);
  }
  return clean as T;
}

/**
 * Validates and sanitizes user appearance overrides so malformed or injected CSS strings
 * are stripped while valid tokens are preserved.
 */
export function sanitizeAppearanceOverrides(
  raw: unknown
): AppearanceOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const clean: AppearanceOverrides = {};

  if (isSafeHexColor(obj.primaryColor)) {
    clean.primaryColor = obj.primaryColor.trim();
  }
  if (isSafeHexColor(obj.backgroundColor)) {
    clean.backgroundColor = obj.backgroundColor.trim();
  }
  if (isSafeHexColor(obj.textColor)) {
    clean.textColor = obj.textColor.trim();
  }
  if (
    typeof obj.fontFamily === 'string' &&
    VALID_FONT_FAMILIES.has(obj.fontFamily as FontFamilyToken)
  ) {
    clean.fontFamily = obj.fontFamily as FontFamilyToken;
  }
  if (
    typeof obj.buttonShape === 'string' &&
    VALID_BUTTON_SHAPES.has(obj.buttonShape as ButtonShapeToken)
  ) {
    clean.buttonShape = obj.buttonShape as ButtonShapeToken;
  }
  if (
    typeof obj.cornerRadius === 'string' &&
    VALID_CORNER_RADII.has(obj.cornerRadius as CornerRadiusToken)
  ) {
    clean.cornerRadius = obj.cornerRadius as CornerRadiusToken;
  }
  if (
    typeof obj.backgroundTreatment === 'string' &&
    VALID_BG_TREATMENTS.has(obj.backgroundTreatment as BackgroundTreatmentToken)
  ) {
    clean.backgroundTreatment =
      obj.backgroundTreatment as BackgroundTreatmentToken;
  }
  if (
    typeof obj.cardWidth === 'string' &&
    VALID_CARD_WIDTHS.has(obj.cardWidth as CardWidthToken)
  ) {
    clean.cardWidth = obj.cardWidth as CardWidthToken;
  }
  if (
    typeof obj.contentAlignment === 'string' &&
    VALID_ALIGNMENTS.has(obj.contentAlignment as ContentAlignmentToken)
  ) {
    clean.contentAlignment = obj.contentAlignment as ContentAlignmentToken;
  }
  if (
    typeof obj.buttonShadow === 'string' &&
    VALID_SHADOWS.has(obj.buttonShadow as ButtonShadowToken)
  ) {
    clean.buttonShadow = obj.buttonShadow as ButtonShadowToken;
  }
  if (
    typeof obj.density === 'string' &&
    VALID_DENSITIES.has(obj.density as SpacingDensityToken)
  ) {
    clean.density = obj.density as SpacingDensityToken;
  }

  return clean;
}

/**
 * Safely migrates a v1 or partial form object to the current v2 FormSchema.
 * Never discards recoverable forms or unknown future properties.
 */
export function migrateFormSchema(raw: unknown): FormSchema | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = sanitizeUntrustedJson(raw) as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id.trim()) return null;
  if (typeof obj.title !== 'string' || !Array.isArray(obj.questions)) return null;

  const now = new Date().toISOString();
  const accentTheme =
    obj.accentTheme === 'coral' ||
    obj.accentTheme === 'blue' ||
    obj.accentTheme === 'yellow' ||
    obj.accentTheme === 'pink' ||
    obj.accentTheme === 'sage'
      ? obj.accentTheme
      : 'coral';

  // Ensure every question, choice, and logic rule has a valid type and stable ID
  const questions: FormQuestion[] = (obj.questions as unknown[])
    .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
    .map((q, idx) => {
      const qId =
        typeof q.id === 'string' && q.id.trim()
          ? q.id
          : generateId(`q_${idx + 1}`);
      const qType: QuestionType =
        typeof q.type === 'string' &&
        VALID_QUESTION_TYPES.has(q.type as QuestionType)
          ? (q.type as QuestionType)
          : 'short_text';

      const rawChoices = Array.isArray(q.choices) ? q.choices : undefined;

      let choices = rawChoices?.map((c, cIdx) => {
        if (c && typeof c === 'object') {
          const cObj = c as Record<string, unknown>;
          return {
            id:
              typeof cObj.id === 'string' && cObj.id.trim()
                ? cObj.id
                : `opt_${qId}_${cIdx + 1}`,
            label:
              typeof cObj.label === 'string'
                ? cObj.label
                : `Option ${cIdx + 1}`,
          };
        }
        return {
          id: `opt_${qId}_${cIdx + 1}`,
          label: String(c),
        };
      });

      if (
        (qType === 'single_choice' ||
          qType === 'multiple_choice' ||
          qType === 'dropdown') &&
        (!choices || choices.length === 0)
      ) {
        choices = [
          { id: `opt_${qId}_1`, label: 'Option A' },
          { id: `opt_${qId}_2`, label: 'Option B' },
        ];
      } else if (qType === 'yes_no' && (!choices || choices.length === 0)) {
        choices = [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ];
      }

      const rawRules = Array.isArray(q.logicRules) ? q.logicRules : [];
      const logicRules: LogicRule[] = rawRules
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        .map((r, rIdx) => ({
          id:
            typeof r.id === 'string' && r.id.trim()
              ? r.id
              : `rule_${qId}_${rIdx + 1}`,
          operator:
            typeof r.operator === 'string' &&
            VALID_LOGIC_OPERATORS.has(r.operator as LogicOperator)
              ? (r.operator as LogicOperator)
              : 'equals',
          value: typeof r.value === 'string' ? r.value : String(r.value ?? ''),
          targetId:
            typeof r.targetId === 'string' && r.targetId.trim()
              ? r.targetId
              : 'completion',
        }));

      return {
        ...(q as unknown as FormQuestion),
        id: qId,
        type: qType,
        title: typeof q.title === 'string' ? q.title : `Question ${idx + 1}`,
        description: typeof q.description === 'string' ? q.description : '',
        required: Boolean(q.required),
        ...(choices ? { choices } : {}),
        logicRules,
        defaultNextId:
          typeof q.defaultNextId === 'string' ? q.defaultNextId : 'next',
      };
    });

  // Migrate or default appearance configuration (defaulting to 'paper')
  const rawAppearance =
    obj.appearance && typeof obj.appearance === 'object'
      ? (obj.appearance as Record<string, unknown>)
      : null;

  const templateId: AppearanceTemplateId =
    rawAppearance && isValidAppearanceTemplateId(rawAppearance.templateId)
      ? rawAppearance.templateId
      : 'paper';

  const overrides = sanitizeAppearanceOverrides(rawAppearance?.overrides);

  const revision =
    typeof obj.revision === 'number' &&
    Number.isFinite(obj.revision) &&
    obj.revision >= 1
      ? Math.floor(obj.revision)
      : 1;

  const welcomeRaw =
    obj.welcomeScreen && typeof obj.welcomeScreen === 'object'
      ? (obj.welcomeScreen as Record<string, unknown>)
      : {};

  const completionRaw =
    obj.completionScreen && typeof obj.completionScreen === 'object'
      ? (obj.completionScreen as Record<string, unknown>)
      : {};

  // Sanitize optional flowCanvasLayout positions
  let flowCanvasLayout: FormSchema['flowCanvasLayout'] = undefined;
  if (obj.flowCanvasLayout && typeof obj.flowCanvasLayout === 'object') {
    const rawLayout = obj.flowCanvasLayout as Record<string, unknown>;
    const cleanPositions: Record<string, { x: number; y: number }> = {};
    if (rawLayout.positions && typeof rawLayout.positions === 'object') {
      for (const [nodeId, pos] of Object.entries(
        rawLayout.positions as Record<string, unknown>
      )) {
        if (pos && typeof pos === 'object') {
          const posObj = pos as Record<string, unknown>;
          if (
            typeof posObj.x === 'number' &&
            Number.isFinite(posObj.x) &&
            typeof posObj.y === 'number' &&
            Number.isFinite(posObj.y)
          ) {
            cleanPositions[nodeId] = {
              x: Math.round(posObj.x),
              y: Math.round(posObj.y),
            };
          }
        }
      }
    }
    const cleanZoom =
      typeof rawLayout.zoom === 'number' &&
      Number.isFinite(rawLayout.zoom) &&
      rawLayout.zoom >= 0.25 &&
      rawLayout.zoom <= 2.5
        ? rawLayout.zoom
        : undefined;
    let cleanPan: { x: number; y: number } | undefined = undefined;
    if (rawLayout.pan && typeof rawLayout.pan === 'object') {
      const panObj = rawLayout.pan as Record<string, unknown>;
      if (
        typeof panObj.x === 'number' &&
        Number.isFinite(panObj.x) &&
        typeof panObj.y === 'number' &&
        Number.isFinite(panObj.y)
      ) {
        cleanPan = { x: Math.round(panObj.x), y: Math.round(panObj.y) };
      }
    }
    flowCanvasLayout = {
      positions: cleanPositions,
      ...(cleanZoom !== undefined ? { zoom: cleanZoom } : {}),
      ...(cleanPan ? { pan: cleanPan } : {}),
    };
  }

  return {
    ...(obj as unknown as FormSchema),
    id: obj.id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision,
    title: obj.title,
    description: typeof obj.description === 'string' ? obj.description : '',
    accentTheme,
    presentationMode:
      obj.presentationMode === 'classic' ||
      obj.presentationMode === 'multi_step'
        ? obj.presentationMode
        : 'conversational',
    appearance: {
      schemaVersion: 1,
      templateId,
      overrides,
    },
    questionOrder: questions.map((q) => q.id),
    ...(flowCanvasLayout ? { flowCanvasLayout } : {}),
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : now,
    welcomeScreen: {
      enabled:
        typeof welcomeRaw.enabled === 'boolean' ? welcomeRaw.enabled : true,
      title:
        typeof welcomeRaw.title === 'string'
          ? welcomeRaw.title
          : obj.title,
      description:
        typeof welcomeRaw.description === 'string'
          ? welcomeRaw.description
          : '',
      buttonText:
        typeof welcomeRaw.buttonText === 'string'
          ? welcomeRaw.buttonText
          : 'Start',
      timeEstimate:
        typeof welcomeRaw.timeEstimate === 'string'
          ? welcomeRaw.timeEstimate
          : 'Takes ~1 minute',
      accentColor: accentTheme,
    },
    questions,
    completionScreen: {
      title:
        typeof completionRaw.title === 'string'
          ? completionRaw.title
          : 'Thank you!',
      description:
        typeof completionRaw.description === 'string'
          ? completionRaw.description
          : 'Thank you for sharing your response.',
      buttonText:
        typeof completionRaw.buttonText === 'string'
          ? completionRaw.buttonText
          : 'Done',
      showAnswerReceipt:
        typeof completionRaw.showAnswerReceipt === 'boolean'
          ? completionRaw.showAnswerReceipt
          : true,
    },
  };
}

export function migrateResponseRecord(
  raw: unknown,
  formsById: Map<string, FormSchema>
): FormResponseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = sanitizeUntrustedJson(raw) as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.formId !== 'string') return null;
  if (!obj.answers || typeof obj.answers !== 'object' || Array.isArray(obj.answers)) {
    return null;
  }

  const form = formsById.get(obj.formId);
  const answers = obj.answers as FormResponseRecord['answers'];
  const existingNorm =
    obj.normalizedAnswers &&
    typeof obj.normalizedAnswers === 'object' &&
    !Array.isArray(obj.normalizedAnswers)
      ? (obj.normalizedAnswers as FormResponseRecord['normalizedAnswers'])
      : undefined;

  let normalizedAnswers = existingNorm;
  if (!normalizedAnswers && form) {
    normalizedAnswers = {};
    for (const [qId, val] of Object.entries(answers)) {
      const q = form.questions.find((item) => item.id === qId);
      if (q) {
        normalizedAnswers[qId] = normalizeQuestionAnswer(q, val);
      }
    }
  }

  const cleanAttribution = sanitizeSessionAttribution(obj.attribution);
  const cleanViewport: ViewportCategory | undefined =
    typeof obj.viewport === 'string' &&
    VALID_VIEWPORT_CATEGORIES.has(obj.viewport as ViewportCategory)
      ? (obj.viewport as ViewportCategory)
      : undefined;
  const cleanSessionId =
    typeof obj.sessionId === 'string' && obj.sessionId.trim()
      ? obj.sessionId.trim().slice(0, 128)
      : undefined;
  const cleanSessionSource: AnalyticsSessionSource | undefined =
    typeof obj.sessionSource === 'string' &&
    VALID_SESSION_SOURCES.has(obj.sessionSource as AnalyticsSessionSource)
      ? (obj.sessionSource as AnalyticsSessionSource)
      : undefined;

  return {
    id: obj.id,
    formId: obj.formId,
    formRevision:
      typeof obj.formRevision === 'number' &&
      Number.isFinite(obj.formRevision) &&
      obj.formRevision >= 1
        ? Math.floor(obj.formRevision)
        : 1,
    submittedAt:
      typeof obj.submittedAt === 'string'
        ? obj.submittedAt
        : new Date().toISOString(),
    durationSeconds:
      typeof obj.durationSeconds === 'number' &&
      Number.isFinite(obj.durationSeconds) &&
      obj.durationSeconds >= 0
        ? obj.durationSeconds
        : 30,
    answers,
    ...(normalizedAnswers ? { normalizedAnswers } : {}),
    visitedQuestionIds: Array.isArray(obj.visitedQuestionIds)
      ? (obj.visitedQuestionIds as string[])
      : Object.keys(answers),
    ...(obj.externalContext &&
    typeof obj.externalContext === 'object' &&
    !Array.isArray(obj.externalContext)
      ? { externalContext: obj.externalContext as FormResponseRecord['externalContext'] }
      : {}),
    ...(cleanAttribution ? { attribution: cleanAttribution } : {}),
    ...(cleanViewport ? { viewport: cleanViewport } : {}),
    ...(cleanSessionId ? { sessionId: cleanSessionId } : {}),
    ...(cleanSessionSource ? { sessionSource: cleanSessionSource } : {}),
  };
}

export function exportWorkspaceBackup(
  forms: FormSchema[],
  responses: FormResponseRecord[],
  revisions: FormRevisionSnapshot[] = [],
  analyticsEvents: AnalyticsEvent[] = []
): string {
  const payload: WorkspaceBackupPayload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'plyli',
    forms,
    responses,
    revisions,
    analyticsEvents,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseWorkspaceBackup(rawJson: string): {
  valid: boolean;
  forms?: FormSchema[];
  responses?: FormResponseRecord[];
  revisions?: FormRevisionSnapshot[];
  analyticsEvents?: AnalyticsEvent[];
  warnings?: string[];
  error?: string;
} {
  try {
    const rawParsed = JSON.parse(rawJson);
    if (!rawParsed || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
      return { valid: false, error: 'Backup file must contain a JSON object.' };
    }
    const parsed = sanitizeUntrustedJson(rawParsed) as Record<string, unknown>;
    if (!Array.isArray(parsed.forms)) {
      return { valid: false, error: 'Missing "forms" array in backup file.' };
    }

    const warnings: string[] = [];
    if (
      typeof parsed.schemaVersion === 'number' &&
      parsed.schemaVersion > CURRENT_SCHEMA_VERSION
    ) {
      warnings.push(
        `Backup was created with a newer schemaVersion (${parsed.schemaVersion}); loaded in compatibility mode.`
      );
    }

    const migratedForms: FormSchema[] = [];
    for (const rawForm of parsed.forms) {
      const migrated = migrateFormSchema(rawForm);
      if (migrated) {
        migratedForms.push(migrated);
      } else {
        return {
          valid: false,
          error:
            'One or more forms in the backup are missing required id, title, or questions.',
        };
      }
    }

    const formsById = new Map(migratedForms.map((f) => [f.id, f]));
    const rawResponses = Array.isArray(parsed.responses) ? parsed.responses : [];
    const migratedResponses: FormResponseRecord[] = [];
    for (const r of rawResponses) {
      const m = migrateResponseRecord(r, formsById);
      if (m) migratedResponses.push(m);
    }

    const revisions: FormRevisionSnapshot[] = Array.isArray(parsed.revisions)
      ? parsed.revisions.filter(
          (rev: unknown): rev is FormRevisionSnapshot =>
            Boolean(
              rev &&
                typeof rev === 'object' &&
                typeof (rev as FormRevisionSnapshot).formId === 'string' &&
                typeof (rev as FormRevisionSnapshot).revision === 'number' &&
                Array.isArray((rev as FormRevisionSnapshot).questions)
            )
        )
      : [];

    const rawEvents = Array.isArray(parsed.analyticsEvents)
      ? (parsed.analyticsEvents as AnalyticsEvent[])
      : [];
    const analyticsEvents = deduplicateAnalyticsEvents(rawEvents).filter((ev) =>
      formsById.has(ev.formId)
    );

    return {
      valid: true,
      forms: migratedForms,
      responses: migratedResponses,
      revisions,
      analyticsEvents,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch {
    return {
      valid: false,
      error: 'Could not parse JSON. Please make sure the file is valid JSON.',
    };
  }
}

/**
 * Checks whether a form update modified structural/content fields that affect respondents
 * (questions, choices, logic rules, welcome/completion screens) so we only increment
 * `revision` on meaningful content edits and NOT on pure UI selection or appearance tweaks.
 */
export function hasFormContentChanged(
  prev: FormSchema,
  next: FormSchema
): boolean {
  if (prev.title !== next.title) return true;
  if (JSON.stringify(prev.questions) !== JSON.stringify(next.questions)) {
    return true;
  }
  if (
    JSON.stringify(prev.completionScreen) !==
    JSON.stringify(next.completionScreen)
  ) {
    return true;
  }
  return false;
}
