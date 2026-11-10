import { z } from 'zod';
import * as contracts from './generated/contracts.js';
import { operations, type OperationId } from './operations.js';

export type { FormSchema, FormResponseRecord, ExternalHostContext } from './generated/types.js';
export type { FormDocument, IntegrationPolicy, ApiScope, ImportBackup } from './generated/contracts.js';
export type { OperationId } from './operations.js';
export { operations } from './operations.js';
export interface Page<T, C = string> { data: T[]; nextCursor: C | null }
export interface Pagination<C = string> { limit?: number; cursor?: C }
export interface FormPagination extends Pagination { archived?: boolean }
export type SubmissionInput = z.input<typeof contracts.submissionInputSchema>;
export type SubmissionReceipt = z.output<typeof contracts.submissionReceiptSchema>;
export type FormDefinition = z.input<typeof contracts.formDefinitionSchema>;
export type CreateKeyInput = z.input<typeof contracts.createKeySchema>;
export type IntegrationSettings = z.input<typeof contracts.integrationSettingsSchema>;
export type RetentionSettings = z.infer<typeof contracts.retentionSettingsSchema>;
export type ValidationResult = z.infer<typeof contracts.validationResultSchema>;
export type RevisionRecord = z.infer<typeof contracts.revisionRecordSchema>;
export type KeyInfo = z.infer<typeof contracts.keyInfoSchema>;
export type AnalyticsEvent = z.infer<typeof contracts.analyticsEventSchema>;

export class PlyliError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
    public readonly retryAfter?: string,
  ) { super(message); this.name = 'PlyliError'; }
}

export interface PlyliOptions {
  baseUrl: string;
  apiKey?: string;
  /** Same-origin browser session, or a trusted server request's Cookie header. */
  session?: { cookie?: string };
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const pageSchema = <T>(item: z.ZodType<T>) => z.object({ data: z.array(item), nextCursor: contracts.resourceId.nullable() });
const revisionPage = z.object({ data: z.array(contracts.revisionRecordSchema), nextCursor: z.number().int().positive().nullable() });
const paginationSchema = z.strictObject({ limit: z.number().int().min(1).max(100).optional(), cursor: contracts.resourceId.optional(), archived: z.boolean().optional() });
const idempotencySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
const version = (expectedVersion: number) => contracts.versionSchema.parse({ expectedVersion });

function query(pagination: Pagination<string | number> & { archived?: boolean } = {}, numeric = false) {
  const schema = numeric ? paginationSchema.extend({ cursor: z.number().int().positive().optional() }) : paginationSchema;
  const parsed = schema.parse(pagination);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) if (value !== undefined) params.set(key, String(value));
  return params.size ? `?${params}` : '';
}

export class PlyliClient {
  private readonly base: string;
  private readonly origin: string;
  private readonly transport: typeof fetch;
  private readonly timeout: number;
  private readonly options: PlyliOptions;

  constructor(options: PlyliOptions) {
    const url = new URL(options.baseUrl);
    if (url.username || url.password || url.search || url.hash || !['/', '/api/v1', '/api/v1/'].includes(url.pathname)) throw new TypeError('Use a server origin or its /api/v1 URL without credentials, query or fragment.');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new TypeError('Remote Plyli servers require HTTPS.');
    if (options.apiKey !== undefined && !options.apiKey.trim()) throw new TypeError('An API key cannot be empty.');
    if (options.apiKey && options.session) throw new TypeError('Choose API key or session authentication.');
    if (typeof window !== 'undefined') {
      if (options.apiKey) throw new TypeError('API keys belong on your backend. Use the anonymous client in browsers.');
      if (options.session?.cookie !== undefined) throw new TypeError('Browsers manage session cookies automatically.');
      if (options.session && window.location.origin !== url.origin) throw new TypeError('Browser sessions require the same Plyli origin.');
    } else if (options.session && !options.session.cookie?.trim()) throw new TypeError('Server session clients require a trusted request Cookie header.');
    if (options.session?.cookie && /[\r\n]/.test(options.session.cookie)) throw new TypeError('Invalid Cookie header.');
    this.timeout = z.number().int().min(1).max(300000).parse(options.timeoutMs ?? 15000);
    this.options = { ...options, ...(options.session ? { session: { ...options.session } } : {}) };
    this.origin = url.origin;
    this.base = `${url.origin}/api/v1`;
    this.transport = options.fetch ?? fetch;
  }

  private async request<T>(operation: OperationId, params: Record<string, string>, schema: z.ZodType<T>, body?: unknown, pagination?: string, key?: string): Promise<T> {
    const [method, template, access] = operations[operation];
    const authenticated = access !== 'public';
    if (authenticated && !this.options.apiKey && !this.options.session) throw new TypeError('This operation requires a server-side API key or signed-in session.');
    if (access === 'session' && !this.options.session) throw new TypeError('This operation requires a signed-in session; API keys are not accepted.');
    const path = template.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(contracts.resourceId.parse(params[name])));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (key !== undefined) headers['Idempotency-Key'] = idempotencySchema.parse(key);
    if (authenticated && this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`;
    if (authenticated && this.options.session?.cookie) headers.Cookie = this.options.session.cookie;
    if (authenticated && this.options.session && method !== 'GET') headers.Origin = this.origin;
    let response: Response;
    try {
      response = await this.transport(`${this.base}${path}${pagination ?? ''}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(this.timeout), headers,
        credentials: authenticated && this.options.session ? 'same-origin' : 'omit',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw new PlyliError(0, error instanceof Error && /timeout|abort/i.test(error.name) ? 'TIMEOUT' : 'NETWORK_ERROR', 'The Plyli request could not be completed.');
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new PlyliError(response.status, 'INVALID_RESPONSE', 'Plyli returned a non-JSON response.', response.headers.get('x-request-id') ?? undefined); }
    if (!response.ok) {
      const parsed = contracts.errorEnvelopeSchema.safeParse(payload);
      if (parsed.success) throw new PlyliError(response.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.requestId, parsed.data.error.details, response.headers.get('retry-after') ?? undefined);
      throw new PlyliError(response.status, 'HTTP_ERROR', `Plyli returned HTTP ${response.status}.`);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new PlyliError(response.status, 'INVALID_RESPONSE', 'Plyli returned an unexpected response shape.', response.headers.get('x-request-id') ?? undefined);
    return parsed.data;
  }

  private async data<T>(operation: OperationId, params: Record<string, string>, schema: z.ZodType<T>, body?: unknown, key?: string) {
    return (await this.request(operation, params, z.object({ data: schema }), body, undefined, key)).data;
  }

  provisionWorkspace() { return this.data('provisionWorkspace', {}, contracts.workspaceInfoSchema, {}); }
  listForms(workspaceId: string, pagination?: FormPagination) { return this.request('listForms', { workspaceId }, pageSchema(contracts.formDocumentSchema), undefined, query(pagination)); }
  async *iterateForms(workspaceId: string, options: Omit<FormPagination, 'cursor'> = {}) {
    let cursor: string | null = null;
    do {
      const page = await this.listForms(workspaceId, { ...options, ...(cursor ? { cursor } : {}) });
      yield* page.data;
      if (page.nextCursor && page.nextCursor === cursor) throw new PlyliError(200, 'INVALID_RESPONSE', 'Pagination did not advance.');
      cursor = page.nextCursor;
    } while (cursor);
  }
  getForm(workspaceId: string, formId: string) { return this.data('getForm', { workspaceId, formId }, contracts.formDocumentSchema); }
  createForm(workspaceId: string, definition: FormDefinition) { return this.data('createForm', { workspaceId }, contracts.formDocumentSchema, contracts.createFormSchema.parse({ definition })); }
  saveDraft(workspaceId: string, formId: string, expectedVersion: number, definition: FormDefinition) { return this.data('saveDraft', { workspaceId, formId }, contracts.formDocumentSchema, contracts.updateFormSchema.parse({ expectedVersion, definition })); }
  archiveForm(workspaceId: string, formId: string, expectedVersion: number) { return this.data('archiveForm', { workspaceId, formId }, z.object({ archived: z.literal(true) }), version(expectedVersion)); }
  publish(workspaceId: string, formId: string, expectedVersion: number) { return this.data('publish', { workspaceId, formId }, contracts.formDocumentSchema, version(expectedVersion)); }
  unpublish(workspaceId: string, formId: string, expectedVersion: number) { return this.data('unpublish', { workspaceId, formId }, contracts.formDocumentSchema, version(expectedVersion)); }
  restoreForm(workspaceId: string, formId: string, expectedVersion: number) { return this.data('restoreForm', { workspaceId, formId }, contracts.formDocumentSchema, version(expectedVersion)); }
  getPublishedForm(workspaceId: string, formId: string) { return this.data('getPublishedForm', { workspaceId, formId }, contracts.formDefinitionSchema); }
  getPublicForm(slug: string) { return this.data('getPublicForm', { slug }, contracts.formDefinitionSchema); }
  validateSubmission(workspaceId: string, formId: string, input: SubmissionInput) { return this.data('validateSubmission', { workspaceId, formId }, contracts.validationResultSchema, contracts.submissionInputSchema.parse(input)); }
  submit(workspaceId: string, formId: string, input: SubmissionInput, idempotencyKey: string) { return this.data('submit', { workspaceId, formId }, contracts.submissionReceiptSchema, contracts.submissionInputSchema.parse(input), idempotencyKey); }
  submitPublic(slug: string, input: SubmissionInput, idempotencyKey: string) { return this.data('submitPublic', { slug }, contracts.submissionReceiptSchema, contracts.submissionInputSchema.parse(input), idempotencyKey); }
  listSubmissions(workspaceId: string, formId: string, pagination?: Pagination) { return this.request('listSubmissions', { workspaceId, formId }, pageSchema(contracts.responseRecordSchema), undefined, query(pagination)); }
  deleteAllResponses(workspaceId: string, formId: string) { return this.data('deleteAllResponses', { workspaceId, formId }, z.object({ deleted: z.number().int().nonnegative() })); }
  deleteResponse(workspaceId: string, formId: string, responseId: string) { return this.data('deleteResponse', { workspaceId, formId, responseId }, z.object({ deleted: z.number().int().nonnegative() })); }
  listDeletedResponses(workspaceId: string, formId: string, pagination?: Pagination) { return this.request('listDeletedResponses', { workspaceId, formId }, pageSchema(contracts.deletedResponseSchema), undefined, query(pagination)); }
  restoreResponse(workspaceId: string, formId: string, responseId: string) { return this.data('restoreResponse', { workspaceId, formId, responseId }, z.object({ restored: z.literal(true) })); }
  listAnalyticsEvents(workspaceId: string, formId: string, pagination?: Pagination) { return this.request('listAnalyticsEvents', { workspaceId, formId }, pageSchema(contracts.analyticsEventSchema), undefined, query(pagination)); }
  listRevisions(workspaceId: string, formId: string, pagination?: Pagination<number>) { return this.request('listRevisions', { workspaceId, formId }, revisionPage, undefined, query(pagination, true)); }
  getIntegration(workspaceId: string, formId: string) { return this.data('getIntegration', { workspaceId, formId }, contracts.integrationResultSchema); }
  setIntegration(workspaceId: string, formId: string, input: IntegrationSettings) { return this.data('setIntegration', { workspaceId, formId }, contracts.integrationResultSchema, contracts.integrationSettingsSchema.parse(input)); }
  listKeys(workspaceId: string, pagination?: Pagination) { return this.request('listKeys', { workspaceId }, pageSchema(contracts.keyInfoSchema), undefined, query(pagination)); }
  createKey(workspaceId: string, input: CreateKeyInput) { return this.data('createKey', { workspaceId }, contracts.createdKeySchema, contracts.createKeySchema.parse(input)); }
  revokeKey(workspaceId: string, credentialId: string) { return this.data('revokeKey', { workspaceId, credentialId }, z.object({ revoked: z.literal(true) })); }
  getRetention(workspaceId: string) { return this.data('getRetention', { workspaceId }, contracts.retentionSettingsSchema); }
  setRetention(workspaceId: string, input: RetentionSettings) { return this.data('setRetention', { workspaceId }, contracts.retentionSettingsSchema, contracts.retentionSettingsSchema.parse(input)); }
  importBackup(workspaceId: string, backup: z.input<typeof contracts.importBackupSchema>) { return this.data('importBackup', { workspaceId }, contracts.importResultSchema, contracts.importBackupSchema.parse(backup)); }
}
