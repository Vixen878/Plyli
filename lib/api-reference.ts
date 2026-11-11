import { operations, type OperationId } from '../packages/sdk/src/operations';
import { z } from 'zod';
export interface ReferenceField { name: string; type: string; required: boolean; note: string; children: ReferenceField[] }
export interface ReferenceEndpoint { operationId: OperationId; id: string; method: string; path: string; title: string; group: string; access: string; public: boolean; parameters: ReferenceField[]; request: ReferenceField[]; response: ReferenceField[]; statuses: { code: string; note: string }[]; example: unknown; idempotency: boolean }
export interface ApiReferenceData { endpoints: ReferenceEndpoint[] }
const object = z.record(z.string(), z.unknown());
const schemaShape = z.object({ $ref: z.string().optional(), type: z.union([z.string(), z.array(z.string())]).optional(), properties: z.record(z.string(), z.unknown()).optional(), required: z.array(z.string()).optional(), items: z.unknown().optional(), minItems: z.number().optional(), maxItems: z.number().optional(), enum: z.array(z.unknown()).optional(), description: z.string().optional(), format: z.string().optional(), minLength: z.number().optional(), maxLength: z.number().optional(), minimum: z.number().optional(), maximum: z.number().optional(), anyOf: z.array(z.unknown()).optional(), oneOf: z.array(z.unknown()).optional(), additionalProperties: z.unknown().optional() });
const propertyNotes: Record<string, string> = { definition: 'Complete form definition, including questions, logic and appearance.', expectedVersion: 'The current form version returned by the API. Stale saves return 409.', revision: 'Exact published revision rendered to the respondent.', answers: 'Map of question IDs to answer values. Reachable required questions are validated on the server.', externalContext: 'Application metadata matching the form’s typed allowlist. Never grants authorization.', id: 'Stable resource identifier.', formIds: 'Selected form IDs, or null for explicit workspace-wide key access.', scopes: 'Operations this credential is permitted to perform.', expiresAt: 'Expiry timestamp. The credential stops working afterward.', publicSlug: 'Identifier used by the public share link.', publishedRevision: 'Pinned revision respondents receive; null means unpublished.', nextCursor: 'Pass as cursor for the next page. Null means there are no more results.', responseCount: 'Active response count; excludes deleted responses.', responseRetentionDays: 'Days to retain active responses, or null to retain until deletion.', trashRetentionDays: 'Recovery window before deleted answer payloads are erased.', requestId: 'Correlation ID for investigating this request.', replayed: 'True when an identical idempotent request returned its original receipt.' };
const responseNotes: Record<string, string> = { '200': 'Success, or an identical idempotent replay.', '201': 'Resource created.', '400': 'Invalid JSON request.', '401': 'Sign-in or a valid API key is required.', '403': 'Permission, scope or request origin rejected.', '404': 'Resource unavailable or outside your permitted forms.', '409': 'Version, revision, identifier or idempotency conflict.', '410': 'Response deleted or its recovery window has expired.', '413': 'Request exceeds the size limit.', '415': 'Send UTF-8 application/json.', '422': 'Correct the indicated request fields or answers.', '429': 'Rate limit reached. Respect Retry-After.', '500': 'The request could not be completed. Use requestId when reporting it.', '503': 'Service temporarily unavailable.' };

export function buildApiReference(raw: unknown, formExample: unknown): ApiReferenceData {
  const doc = z.object({ paths: z.record(z.string(), object), components: z.object({ schemas: object }) }).parse(raw);
  function resolveSchema(rawSchema: unknown): z.infer<typeof schemaShape> {
    const result = schemaShape.safeParse(rawSchema); if (!result.success) return {};
    if (result.data.$ref) return schemaShape.parse(doc.components.schemas[result.data.$ref.split('/').at(-1) ?? ''] ?? {});
    return result.data;
  }
  function typeOf(rawSchema: unknown): string {
    const s = resolveSchema(rawSchema);
    if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
    if (s.anyOf || s.oneOf) return (s.anyOf ?? s.oneOf ?? []).map(typeOf).join(' | ');
    if (s.type === 'array') return `${typeOf(s.items)}[]`;
    if (Array.isArray(s.type)) return s.type.join(' | ');
    return s.type ?? (s.properties ? 'object' : s.additionalProperties ? 'record' : 'value');
  }
  function fields(rawSchema: unknown, depth = 0): ReferenceField[] {
    if (depth > 3) return [];
    const s = resolveSchema(rawSchema); const properties = s.properties ?? (s.type === 'array' ? resolveSchema(s.items).properties : undefined) ?? {};
    return Object.entries(properties).map(([name, value]) => {
      const child = resolveSchema(value);
      const constraints = [child.description ?? propertyNotes[name], child.format ? `Format: ${child.format}` : '', child.minLength !== undefined ? `Min length ${child.minLength}` : '', child.maxLength !== undefined ? `Max length ${child.maxLength}` : '', child.minItems !== undefined ? `Min items ${child.minItems}` : '', child.maxItems !== undefined ? `Max items ${child.maxItems}` : '', child.minimum !== undefined ? `Min ${child.minimum}` : '', child.maximum !== undefined ? `Max ${child.maximum}` : ''].filter(Boolean).join(' · ');
      return { name, type: typeOf(value), required: s.required?.includes(name) ?? false, note: constraints, children: fields(child.type === 'array' ? child.items : value, depth + 1) };
    });
  }
  function sample(rawSchema: unknown, depth = 0, field = ''): unknown {
    if (depth > 3) return {};
    const s = resolveSchema(rawSchema);
    if (s.enum?.length) return s.enum[0];
    if (s.anyOf || s.oneOf) return sample((s.anyOf ?? s.oneOf ?? [])[0], depth + 1, field);
    if (s.type === 'object' || s.properties) return Object.fromEntries(Object.entries(s.properties ?? {}).filter(([name]) => s.required?.includes(name)).map(([name, child]) => [name, sample(child, depth + 1, name)]));
    if (s.type === 'array') return [sample(s.items, depth + 1, field)];
    if (s.type === 'number' || s.type === 'integer') return Math.max(1, s.minimum ?? 1);
    if (s.type === 'boolean') return false;
    if (field === 'formId') return 'form_123';
    return s.format === 'date-time' ? '2026-11-04T10:00:00Z' : field === 'id' ? 'form_123' : 'example';
  }
  const endpoints: ReferenceEndpoint[] = [];
  for (const [path, methods] of Object.entries(doc.paths)) for (const [method, value] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'delete'].includes(method)) continue;
    const operation = z.object({ operationId: z.enum(Object.keys(operations) as [OperationId, ...OperationId[]]), summary: z.string(), security: z.array(object).optional(), parameters: z.array(z.object({ name: z.string(), in: z.string(), required: z.boolean().optional(), description: z.string().optional(), schema: z.unknown() })).default([]), requestBody: z.object({ content: z.record(z.string(), z.object({ schema: z.unknown() })) }).optional(), responses: z.record(z.string(), z.object({ description: z.string(), content: z.record(z.string(), z.object({ schema: z.unknown() })).optional() })) }).parse(value);
    const requestSchema = operation.requestBody?.content['application/json']?.schema;
    const success = operation.responses['200'] ?? operation.responses['201'];
    const responseSchema = success?.content?.['application/json']?.schema;
    const group = path.includes('/analytics-events') ? 'Analytics' : path.includes('/revisions') ? 'Revisions' : path.startsWith('/public') ? 'Public forms' : path.includes('/keys') ? 'API keys' : path.includes('/retention') ? 'Data retention' : path.includes('/submissions') ? 'Responses' : /integration|published|validate/.test(path) ? 'Integrations' : path.includes('/imports') ? 'Backups' : path.includes('/personal') ? 'Workspaces' : 'Forms';
    let example = requestSchema ? sample(requestSchema) : undefined;
    if (method === 'post' && path.endsWith('/forms') || method === 'put' && /\/forms\/\{formId\}$/.test(path)) example = method === 'put' ? { expectedVersion: 1, definition: formExample } : { definition: formExample };
    if (method === 'post' && /submissions$|\/validate$/.test(path)) example = { revision: 1, answers: { q_name: 'Avery' } };
    if (method === 'post' && path.endsWith('/keys')) example = { name: 'Registration app', scopes: ['forms:read', 'submissions:write'], formIds: ['form_123'] };
    if (method === 'post' && path.endsWith('/imports')) example = { schemaVersion: 2, exportedAt: '2026-11-04T10:00:00Z', app: 'plyli', forms: [formExample], responses: [], revisions: [], fullRevisions: [], analyticsEvents: [] };
    if (method === 'put' && path.endsWith('/integration')) example = { expectedVersion: 1, policy: { mode: 'private', allowPublicContext: false, contextFields: [{ key: 'eventId', type: 'string', required: true }] } };
    if (method === 'put' && path.endsWith('/retention')) example = { responseRetentionDays: 90, trashRetentionDays: 7 };
    endpoints.push({ operationId: operation.operationId, id: `${method}-${path}`.replace(/[^a-zA-Z0-9_-]/g, '-'), method: method.toUpperCase(), path, title: operation.summary.replace(/\s*\([^)]*\)\s*$/, ''), group, public: operation.security?.length === 0, access: operation.summary.match(/\(([^)]+)\)/)?.[1] ?? 'Authenticated', parameters: operation.parameters.map((p) => ({ name: p.name, type: typeOf(p.schema), required: p.required ?? false, note: p.description ?? (p.in === 'path' ? 'URL path' : p.in === 'header' ? 'Request header' : 'Query parameter'), children: [] })), request: fields(requestSchema), response: fields(responseSchema), statuses: Object.keys(operation.responses).map((code) => ({ code, note: responseNotes[code] ?? operation.responses[code].description })), example: example ?? null, idempotency: operation.parameters.some((p) => p.name === 'Idempotency-Key') });
  }
  return { endpoints };
}
