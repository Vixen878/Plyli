import { z } from 'zod';
import type { FormSchema, FormQuestion, FormResponseRecord, FormRevisionSnapshot } from './types';
import type { AnalyticsEvent } from './analytics';
import { inspectFormWorkflow } from './branching';

// Shared browser/server contracts. No database, framework or environment imports.
export const resourceId = z.string().min(1).max(191).regex(/^[A-Za-z0-9_-]+$/)
  .refine((v) => !['__proto__', 'prototype', 'constructor', 'next', 'completion', 'welcome'].includes(v), 'Reserved identifier');
const text = z.string().max(20000);
const shortText = z.string().max(255);
const timestamp = z.iso.datetime({ offset: true });
const theme = z.enum(['coral', 'blue', 'yellow', 'pink', 'sage']);
export const answerValueSchema = z.union([text, z.number().finite(), z.array(shortText).max(200), z.null()]);
const finiteNumber = z.number().finite();
const bound = z.number().int().min(0).max(20000);
const position = z.strictObject({ x: finiteNumber, y: finiteNumber });
const appearanceSchema = z.strictObject({
  schemaVersion: z.number().int().min(1).max(1).optional(),
  templateId: z.enum(['paper', 'canvas', 'editorial', 'pop', 'after-dark', 'bloom', 'breeze', 'corporate', 'gaming', 'blueprint', 'terracotta', 'vamori', 'veritas', 'tiny-et', 'akarii', 'riff']),
  overrides: z.strictObject({
    primaryColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
    backgroundColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
    textColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
    fontFamily: z.enum(['display', 'sans', 'serif', 'mono']).optional(),
    buttonShape: z.enum(['rounded', 'pill', 'sharp']).optional(),
    cornerRadius: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
    backgroundTreatment: z.enum(['solid', 'paper-grain', 'subtle-grid', 'soft-gradient']).optional(),
    cardWidth: z.enum(['compact', 'standard', 'wide']).optional(),
    contentAlignment: z.enum(['left', 'center']).optional(),
    buttonShadow: z.enum(['tactile', 'soft', 'none']).optional(),
    density: z.enum(['compact', 'comfortable', 'spacious']).optional(),
  }),
});

export const questionSchema = z.strictObject({
  id: resourceId,
  type: z.enum(['short_text', 'long_text', 'email', 'single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'rating', 'number', 'date']),
  title: text,
  description: text,
  required: z.boolean(),
  defaultValue: z.union([text, finiteNumber, z.array(shortText).max(200)]).optional(),
  placeholder: text.optional(),
  choices: z.array(z.strictObject({ id: resourceId, label: shortText })).max(200).optional(),
  maxRating: z.number().int().min(1).max(100).optional(),
  minNumber: finiteNumber.optional(), maxNumber: finiteNumber.optional(),
  minLength: bound.optional(), maxLength: bound.optional(),
  minChoices: bound.optional(), maxChoices: bound.optional(),
  logicRules: z.array(z.strictObject({
    id: resourceId,
    operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_answered']),
    value: text,
    targetId: z.union([resourceId, z.literal('completion')]),
  })).max(200),
  defaultNextId: z.union([resourceId, z.literal('next'), z.literal('completion')]).optional(),
}).superRefine((q, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (new Set(q.choices?.map((c) => c.id.toLowerCase())).size !== (q.choices?.length ?? 0)) issue('Duplicate choice IDs');
  if (new Set(q.logicRules.map((r) => r.id)).size !== q.logicRules.length) issue('Duplicate rule IDs');
  for (const [min, max] of [[q.minNumber, q.maxNumber], [q.minLength, q.maxLength], [q.minChoices, q.maxChoices]]) {
    if (min !== undefined && max !== undefined && min > max) issue('Minimum exceeds maximum');
  }
}) satisfies z.ZodType<FormQuestion>;

const completionScreenSchema = z.strictObject({
  id: resourceId.optional(), title: text, description: text,
  buttonText: shortText, showAnswerReceipt: z.boolean(),
});

export const formDefinitionSchema = z.strictObject({
  id: resourceId,
  schemaVersion: z.literal(2),
  revision: z.number().int().min(1).max(2147483646),
  title: z.string().max(255), description: text, accentTheme: theme,
  presentationMode: z.enum(['conversational', 'classic', 'multi_step']).optional(),
  appearance: appearanceSchema.optional(),
  questionOrder: z.array(resourceId).max(500).optional(),
  flowCanvasLayout: z.strictObject({
    positions: z.record(z.string().max(191), position),
    zoom: z.number().positive().max(10).optional(), pan: position.optional(),
  }).optional(),
  metadata: z.strictObject({ createdBy: shortText.optional(), tags: z.array(shortText).max(50).optional(), category: shortText.optional() }).optional(),
  createdAt: timestamp, updatedAt: timestamp,
  welcomeScreen: z.strictObject({ enabled: z.boolean(), title: text, description: text, buttonText: shortText, timeEstimate: shortText, accentColor: theme }),
  questions: z.array(questionSchema).max(500),
  completionScreen: completionScreenSchema,
}).superRefine((form, ctx) => {
  const ids = new Set(form.questions.map((q) => q.id));
  if (ids.size !== form.questions.length) ctx.addIssue({ code: 'custom', message: 'Duplicate question IDs', path: ['questions'] });
  // Drafts may contain unfinished forward references; publishing validates edges.
  if (form.questionOrder && (form.questionOrder.length !== ids.size || form.questionOrder.some((id, i) => id !== form.questions[i]?.id))) {
    ctx.addIssue({ code: 'custom', message: 'questionOrder must match question array order', path: ['questionOrder'] });
  }
}) satisfies z.ZodType<FormSchema>;

export const publishableFormSchema = formDefinitionSchema.superRefine((form, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (!form.questions.length) issue('Published forms need at least one question');
  const workflow = inspectFormWorkflow(form);
  if (workflow.circularPathsDetected || workflow.invalidRuleIds.length) issue('Fix invalid or backward workflow connections before publishing');
  const ids = new Set(form.questions.map((q) => q.id));
  for (const q of form.questions) {
    if (q.defaultNextId && !['next', 'completion'].includes(q.defaultNextId) && !ids.has(q.defaultNextId)) issue('Invalid default branch target');
    if (['single_choice', 'multiple_choice', 'dropdown'].includes(q.type) && !q.choices?.length) issue('Choice questions require options');
  }
});

export const revisionSnapshotSchema = z.strictObject({
  formId: resourceId, revision: z.number().int().positive(), savedAt: timestamp,
  title: text, questions: z.array(questionSchema).max(500), completionScreen: completionScreenSchema,
}) satisfies z.ZodType<FormRevisionSnapshot>;

export const attributionSchema = z.strictObject({
  utm: z.strictObject({
    utm_source: z.string().max(128).nullable(), utm_medium: z.string().max(128).nullable(),
    utm_campaign: z.string().max(128).nullable(), utm_content: z.string().max(128).nullable(), utm_term: z.string().max(128).nullable(),
  }),
  referrerOrigin: z.string().max(255).nullable(), isDirectOrUnknown: z.boolean(),
  capturedAt: timestamp, strategy: z.enum(['session_entry', 'first_touch', 'last_touch']),
});
const viewportSchema = z.enum(['mobile', 'tablet', 'desktop', 'unknown']);
const sessionSourceSchema = z.enum(['local_preview', 'url_test', 'public_live']);
const answersSchema = z.record(resourceId, answerValueSchema);
export const responseRecordSchema = z.strictObject({
  id: resourceId, formId: resourceId, formRevision: z.number().int().positive(), submittedAt: timestamp,
  durationSeconds: z.number().finite().min(0).max(31536000), answers: answersSchema,
  normalizedAnswers: z.record(resourceId, z.strictObject({
    questionId: resourceId, value: answerValueSchema.default(null), choiceIds: z.array(resourceId).max(200).optional(), displayValue: text,
  })).optional(),
  visitedQuestionIds: z.array(resourceId).max(500),
  externalContext: z.record(resourceId, z.union([shortText, finiteNumber, z.boolean()])).optional(),
  attribution: attributionSchema.optional(), viewport: viewportSchema.optional(),
  sessionId: resourceId.optional(), sessionSource: sessionSourceSchema.optional(),
}) satisfies z.ZodType<FormResponseRecord>;

export const analyticsEventSchema = z.strictObject({
  id: resourceId, schemaVersion: z.literal(1), formId: resourceId, formRevision: z.number().int().positive(),
  sessionId: resourceId, type: z.enum(['form_view', 'form_start', 'question_view', 'question_answered', 'validation_error', 'question_exit', 'form_complete']),
  timestamp, questionId: resourceId.optional(), targetNodeId: z.string().max(191).optional(), ruleId: resourceId.optional(),
  activeDurationMs: z.number().finite().min(0).max(300000).optional(), errorCode: shortText.optional(),
  attribution: attributionSchema.optional(), viewport: viewportSchema.optional(), sessionSource: sessionSourceSchema, dedupeKey: shortText.optional(),
}) satisfies z.ZodType<AnalyticsEvent>;

export const scopeSchema = z.enum(['forms:read', 'forms:write', 'forms:publish', 'submissions:read', 'submissions:write', 'submissions:delete', 'analytics:read']);
export type ApiScope = z.infer<typeof scopeSchema>;
export const createFormSchema = z.strictObject({ definition: formDefinitionSchema });
export const updateFormSchema = z.strictObject({ expectedVersion: z.number().int().positive(), definition: formDefinitionSchema });
export const versionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const createKeySchema = z.strictObject({ name: z.string().min(1).max(100), scopes: z.array(scopeSchema).min(1).max(7), expiresAt: timestamp.optional(), formIds: z.array(resourceId).min(1).max(100).nullable().optional() });
export const submissionInputSchema = z.strictObject({
  revision: z.number().int().positive(), answers: answersSchema,
  durationSeconds: z.number().finite().min(0).max(86400).optional(), attribution: attributionSchema.optional(),
  viewport: viewportSchema.optional(), sessionId: resourceId.optional(),
  externalContext: z.record(resourceId, z.union([z.string().max(255), finiteNumber, z.boolean()])).optional(),
});
export const pageQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: resourceId.optional() });
export const formDocumentSchema = z.strictObject({
  definition: formDefinitionSchema, version: z.number().int().positive(), publicSlug: resourceId,
  publishedRevision: z.number().int().positive().nullable(), archivedAt: timestamp.nullable(),
  responseCount: z.number().int().min(0).default(0),
});
export type FormDocument = z.infer<typeof formDocumentSchema>;
export const errorEnvelopeSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), details: z.unknown().optional() }) });
export const workspaceInfoSchema = z.strictObject({ id: resourceId, name: z.string(), role: z.enum(['OWNER', 'EDITOR', 'VIEWER']) });

export const importBackupSchema = z.strictObject({
  // Accept the historical backup marker without emitting it in new exports.
  schemaVersion: z.number().int().min(1).max(2), exportedAt: timestamp,
  app: z.preprocess((value) => value === 'fieldnote-studio' ? 'plyli' : value, z.literal('plyli')),
  forms: z.array(formDefinitionSchema).max(100), responses: z.array(responseRecordSchema).max(5000),
  revisions: z.array(revisionSnapshotSchema).max(5000).default([]), analyticsEvents: z.array(analyticsEventSchema).max(2500).default([]),
  fullRevisions: z.array(formDefinitionSchema).max(5000).default([]),
});
export type ImportBackup = z.infer<typeof importBackupSchema>;

export const integrationPolicySchema = z.strictObject({
  mode: z.enum(['public', 'private']).default('public'), allowPublicContext: z.boolean().default(false),
  contextFields: z.array(z.strictObject({ key: resourceId, type: z.enum(['string', 'number', 'boolean']), required: z.boolean().default(false) })).max(20).default([]),
}).superRefine((policy, ctx) => {
  if (new Set(policy.contextFields.map((f) => f.key)).size !== policy.contextFields.length) ctx.addIssue({ code: 'custom', message: 'Context keys must be unique.' });
  if (policy.mode === 'public' && policy.contextFields.some((f) => f.required)) ctx.addIssue({ code: 'custom', message: 'Required context fields need a private integration. Public forms accept optional context only.' });
});
export type IntegrationPolicy = z.infer<typeof integrationPolicySchema>;
export const integrationSettingsSchema = z.strictObject({ expectedVersion: z.number().int().positive(), policy: integrationPolicySchema });
export const retentionSettingsSchema = z.strictObject({ responseRetentionDays: z.number().int().min(1).max(3650).nullable(), trashRetentionDays: z.number().int().min(1).max(30) });
export const keyInfoSchema = z.strictObject({
  id: resourceId, name: z.string(), prefix: z.string(), scopes: z.array(scopeSchema), formIds: z.array(resourceId).nullable(),
  expiresAt: timestamp.nullable(), revokedAt: timestamp.nullable(), lastUsedAt: timestamp.nullable(), createdAt: timestamp,
});
export const submissionReceiptSchema = z.strictObject({ id: resourceId, formRevision: z.number().int().positive(), submittedAt: timestamp, replayed: z.boolean() });

export const validationResultSchema = z.strictObject({
  valid: z.boolean(), errors: z.record(z.string(), z.string()),
  activeQuestionIds: z.array(resourceId), skippedQuestionIds: z.array(resourceId),
  contextErrors: z.record(z.string(), z.string()),
});
export const revisionRecordSchema = z.strictObject({
  revision: z.number().int().positive(), definition: formDefinitionSchema.nullable(),
  legacySnapshot: revisionSnapshotSchema.nullable(),
});
export const integrationResultSchema = z.strictObject({ version: z.number().int().positive(), policy: integrationPolicySchema });
export const deletedResponseSchema = z.strictObject({ record: responseRecordSchema, deletedAt: timestamp });
export const createdKeySchema = z.strictObject({
  id: resourceId, secret: z.string(), prefix: z.string(), scopes: z.array(scopeSchema), expiresAt: timestamp.nullable(),
});
export const importResultSchema = z.strictObject({ forms: z.number().int(), responses: z.number().int(), revisions: z.number().int(), analyticsEvents: z.number().int() });
