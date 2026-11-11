import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { operations } from '../packages/sdk/src/operations';
import {
  formDefinitionSchema, formDocumentSchema, createFormSchema, updateFormSchema,
  versionSchema, submissionInputSchema, responseRecordSchema, revisionSnapshotSchema,
  createKeySchema, importBackupSchema, analyticsEventSchema, errorEnvelopeSchema, integrationPolicySchema, integrationSettingsSchema, retentionSettingsSchema, keyInfoSchema, submissionReceiptSchema, validationResultSchema, revisionRecordSchema, integrationResultSchema, deletedResponseSchema, createdKeySchema, importResultSchema, workspaceInfoSchema,
} from '@/core/contracts';

const schemas = { EmptyBody: z.strictObject({}), FormDefinition: formDefinitionSchema, FormDocument: formDocumentSchema, CreateForm: createFormSchema, UpdateForm: updateFormSchema, ExpectedVersion: versionSchema, SubmissionInput: submissionInputSchema, ResponseRecord: responseRecordSchema, LegacySnapshot: revisionSnapshotSchema, CreateKey: createKeySchema, ImportBackup: importBackupSchema, AnalyticsEvent: analyticsEventSchema, Error: errorEnvelopeSchema, IntegrationPolicy: integrationPolicySchema, IntegrationSettings: integrationSettingsSchema, RetentionSettings: retentionSettingsSchema, KeyInfo: keyInfoSchema, SubmissionReceipt: submissionReceiptSchema, ValidationResult: validationResultSchema, RevisionRecord: revisionRecordSchema, IntegrationResult: integrationResultSchema, DeletedResponse: deletedResponseSchema, CreatedKey: createdKeySchema, ImportResult: importResultSchema, WorkspaceInfo: workspaceInfoSchema };
type SchemaName = keyof typeof schemas;
const reference = (name: SchemaName) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ 'application/json': { schema } });
const paths: Record<string, Record<string, unknown>> = {};
function operation(path: string, method: string, summary: string, output: unknown, options: { input?: SchemaName; public?: boolean; sessionOnly?: boolean; created?: boolean; pagination?: 'id' | 'revision'; idempotency?: boolean; archived?: boolean } = {}) {
  const parameters: unknown[] = Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
  if (options.pagination) parameters.push({ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }, { name: 'cursor', in: 'query', schema: { type: options.pagination === 'revision' ? 'integer' : 'string' } });
  if (options.idempotency) parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' } });
  if (options.idempotency && !options.public) parameters.push({
    name: 'X-Plyli-Respondent', in: 'header',
    description: 'Stable opaque respondent identifier verified by the calling application. Scoped API keys only.',
    schema: { type: 'string', minLength: 1, maxLength: 191, pattern: '^[A-Za-z0-9_-]+$' },
  });
  if (options.archived) parameters.push({ name: 'archived', in: 'query', schema: { type: 'string', enum: ['true', 'false'], default: 'false' } });
  const successCode = options.created ? '201' : '200';
  const responses: Record<string, unknown> = { [successCode]: { description: 'Success', content: json(output) } };
  if (options.idempotency) responses['200'] = { description: 'Idempotent replay', content: json(output) };
  const errors = ['404', '422', '429', '500', '503', ...(!options.public ? ['401', '403'] : []), ...(method !== 'get' ? ['400', '409', ...(options.input ? ['413', '415'] : [])] : []), ...(/submissions|restore/.test(path) ? ['410'] : [])];
  for (const code of errors) responses[code] = { description: code === '500' ? 'The request could not be completed. Use requestId when investigating.' : `HTTP ${code} error. Inspect error.code and error.requestId.`, content: json(reference('Error')) };
  const operationId = Object.entries(operations).find(([, [verb, route]]) => verb === method.toUpperCase() && route === path)?.[0];
  if (!operationId) throw new Error(`SDK mapping missing for ${method} ${path}`);
  (paths[path] ??= {})[method] = {
    operationId,
    summary, security: options.public ? [] : options.sessionOnly ? [{ sessionCookie: [] }, { secureSessionCookie: [] }] : [{ sessionCookie: [] }, { secureSessionCookie: [] }, { bearerKey: [] }], parameters,
    ...(options.input ? { requestBody: { required: true, content: json(reference(options.input)) } } : {}), responses,
  };
}
const envelope = (schema: unknown) => ({ type: 'object', required: ['data'], properties: { data: schema } });
const page = (schema: unknown, numeric = false) => ({ type: 'object', required: ['data', 'nextCursor'], properties: { data: { type: 'array', items: schema }, nextCursor: { type: [numeric ? 'integer' : 'string', 'null'] } } });
const root = '/workspaces/{workspaceId}'; const form = `${root}/forms/{formId}`;
operation('/workspaces/personal', 'post', 'Provision personal workspace (session only)', envelope(reference('WorkspaceInfo')), { input: 'EmptyBody', sessionOnly: true });
operation(`${root}/forms`, 'get', 'List forms (forms:read)', page(reference('FormDocument')), { pagination: 'id', archived: true });
operation(`${root}/forms`, 'post', 'Create form (forms:write)', envelope(reference('FormDocument')), { input: 'CreateForm', created: true });
operation(form, 'get', 'Get form (forms:read)', envelope(reference('FormDocument')));
operation(form, 'put', 'Update draft (forms:write)', envelope(reference('FormDocument')), { input: 'UpdateForm' });
operation(form, 'delete', 'Archive form (forms:write)', envelope({ type: 'object', properties: { archived: { const: true } } }), { input: 'ExpectedVersion' });
for (const action of ['publish', 'unpublish']) operation(`${form}/${action}`, 'post', `${action === 'publish' ? 'Publish form' : 'Unpublish form'} (forms:publish)`, envelope(reference('FormDocument')), { input: 'ExpectedVersion' });
operation(`${form}/submissions`, 'get', 'List responses (submissions:read)', page(reference('ResponseRecord')), { pagination: 'id' });
operation(`${form}/analytics-events`, 'get', 'List analytics events (analytics:read)', page(reference('AnalyticsEvent')), { pagination: 'id' });
operation(`${form}/revisions`, 'get', 'List form versions (forms:read)', page(reference('RevisionRecord'), true), { pagination: 'revision' });
operation(`${root}/imports`, 'post', 'Import backup (owner/editor session only)', envelope(reference('ImportResult')), { input: 'ImportBackup', created: true, sessionOnly: true });
operation(`${root}/keys`, 'post', 'Create API key (owner session only)', envelope(reference('CreatedKey')), { input: 'CreateKey', created: true, sessionOnly: true });
operation(`${root}/keys/{credentialId}`, 'delete', 'Revoke credential (owner session only)', envelope({ type: 'object', properties: { revoked: { const: true } } }), { sessionOnly: true });
operation(`${root}/keys`, 'get', 'List API keys (owner session only)', page(reference('KeyInfo')), { pagination: 'id', sessionOnly: true });
operation(`${root}/retention`, 'get', 'Get response retention (owner session only)', envelope(reference('RetentionSettings')), { sessionOnly: true });
operation(`${root}/retention`, 'put', 'Set response retention (owner session only)', envelope(reference('RetentionSettings')), { input: 'RetentionSettings', sessionOnly: true });
operation(`${form}/integration`, 'get', 'Get integration settings (forms:read)', envelope(reference('IntegrationResult')));
operation(`${form}/integration`, 'put', 'Update integration settings (owner session only)', envelope(reference('IntegrationResult')), { input: 'IntegrationSettings', sessionOnly: true });
operation(`${form}/published`, 'get', 'Get published form (forms:read)', envelope(reference('FormDefinition')));
operation(`${form}/validate`, 'post', 'Validate answers (submissions:write)', envelope(reference('ValidationResult')), { input: 'SubmissionInput' });
operation(`${form}/submissions`, 'post', 'Submit a response (submissions:write)', envelope(reference('SubmissionReceipt')), { input: 'SubmissionInput', created: true, idempotency: true });
operation(`${form}/submissions`, 'delete', 'Move all responses to recoverable trash (submissions:delete)', envelope({ type: 'object', properties: { deleted: { type: 'integer' } } }));
operation(`${form}/submissions/{responseId}`, 'delete', 'Move response to recoverable trash (submissions:delete)', envelope({ type: 'object', properties: { deleted: { type: 'integer' } } }));
operation(`${form}/submissions/trash`, 'get', 'List deleted responses (submissions:read)', page(reference('DeletedResponse')), { pagination: 'id' });
operation(`${form}/submissions/{responseId}/restore`, 'post', 'Restore response within recovery window (submissions:delete)', envelope({ type: 'object', properties: { restored: { const: true } } }));
operation(`${form}/restore`, 'post', 'Restore archived form (forms:write)', envelope(reference('FormDocument')), { input: 'ExpectedVersion' });
operation('/public/forms/{slug}', 'get', 'Get public form', envelope(reference('FormDefinition')), { public: true });
operation('/public/forms/{slug}/submissions', 'post', 'Submit a public response', envelope(reference('SubmissionReceipt')), { input: 'SubmissionInput', created: true, public: true, idempotency: true });
const spec = {
  openapi: '3.1.0', info: { title: 'Plyli API', version: '1.0.0', description: 'Manage forms, publish revisions and collect responses. Use a scoped server-side key or a signed-in session. Cookie-authenticated writes require the configured Origin.' },
  servers: [{ url: '/api/v1' }], paths,
  components: {
    securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'Session cookie on deployments without the secure cookie prefix.' }, secureSessionCookie: { type: 'apiKey', in: 'cookie', name: '__Secure-better-auth.session_token', description: 'Session cookie on production HTTPS deployments.' }, bearerKey: { type: 'http', scheme: 'bearer', bearerFormat: 'plyli_<random secret>' } },
    schemas: Object.fromEntries(Object.entries({ ...schemas, ImportBackup: importBackupSchema.extend({ app: z.literal('plyli') }) }).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' })])),
  },
};
writeFileSync('public/openapi.json', JSON.stringify(spec, null, 2) + '\n');
console.log(`OpenAPI generated for ${Object.keys(paths).length} paths.`);
