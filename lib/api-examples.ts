import type { ReferenceEndpoint } from './api-reference';
import type { OperationId } from '../packages/sdk/src/operations';

export const exampleLanguages = ['TypeScript SDK', 'TypeScript Fetch', 'cURL'] as const;
export type ExampleLanguage = typeof exampleLanguages[number];

export function parseApiOrigin(value: string) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && loopback) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Use an HTTPS origin or HTTP loopback origin.');
  return url.origin;
}

const ws = "'ws_123'";
const form = "'form_123'";
const pair = `${ws}, ${form}`;
const page = '{ limit: 25 }';
const input = "{ revision: published.revision, answers: { [published.questions[0].id]: 'Avery' } }";

function sdkCall(endpoint: ReferenceEndpoint): string {
  const body = JSON.stringify(endpoint.example, null, 2);
  const published = `const published = await plyli.${endpoint.public ? "getPublicForm('published_slug')" : `getPublishedForm(${pair})`};\n`;
  const calls: Record<OperationId, string> = {
    provisionWorkspace: 'const workspace = await plyli.provisionWorkspace();',
    listForms: `const firstPage = await plyli.listForms(${ws}, ${page});\nif (firstPage.nextCursor) {\n  const nextPage = await plyli.listForms(${ws}, { limit: 25, cursor: firstPage.nextCursor });\n  console.log(nextPage.data);\n}`,
    createForm: `const { definition } = ${body} satisfies { definition: FormDefinition };\nconst created = await plyli.createForm(${ws}, definition);`,
    getForm: `const document = await plyli.getForm(${pair});`,
    saveDraft: `const current = await plyli.getForm(${pair});\nconst updated = await plyli.saveDraft(${pair}, current.version, {\n  ...current.definition, title: 'Event registration',\n});`,
    archiveForm: `const current = await plyli.getForm(${pair});\nconst result = await plyli.archiveForm(${pair}, current.version);`,
    publish: `const current = await plyli.getForm(${pair});\nconst published = await plyli.publish(${pair}, current.version);`,
    unpublish: `const current = await plyli.getForm(${pair});\nconst draft = await plyli.unpublish(${pair}, current.version);`,
    restoreForm: `const archived = await plyli.listForms(${ws}, { archived: true });\nconst document = archived.data.find((item) => item.definition.id === ${form});\nif (!document) throw new Error('Archived form not found');\nconst restored = await plyli.restoreForm(${pair}, document.version);`,
    getPublishedForm: `const published = await plyli.getPublishedForm(${pair});`,
    getPublicForm: "const published = await plyli.getPublicForm('published_slug');",
    validateSubmission: published + `const validation = await plyli.validateSubmission(${pair}, ${input});\nif (!validation.valid) console.log(validation.errors, validation.contextErrors);`,
    submit: published + `const attemptId = crypto.randomUUID(); // Save once per attempt; reuse for identical retries.\nconst receipt = await plyli.submit(${pair}, ${input}, attemptId);`,
    submitPublic: published + `const attemptId = crypto.randomUUID(); // Save once per attempt; reuse for identical retries.\nconst receipt = await plyli.submitPublic('published_slug', ${input}, attemptId);`,
    listSubmissions: `const responses = await plyli.listSubmissions(${pair}, ${page});\nconsole.log(responses.data, responses.nextCursor);`,
    deleteAllResponses: `const result = await plyli.deleteAllResponses(${pair});`,
    deleteResponse: `const result = await plyli.deleteResponse(${pair}, 'response_123');`,
    listDeletedResponses: `const trash = await plyli.listDeletedResponses(${pair}, ${page});`,
    restoreResponse: `const result = await plyli.restoreResponse(${pair}, 'response_123');`,
    listAnalyticsEvents: `const events = await plyli.listAnalyticsEvents(${pair}, ${page});\nconsole.log(events.data.map((event) => event.attribution?.utm));`,
    listRevisions: `const revisions = await plyli.listRevisions(${pair}, ${page});\n// Revision cursors are numbers; other list cursors are strings.\nif (revisions.nextCursor) await plyli.listRevisions(${pair}, { cursor: revisions.nextCursor });`,
    getIntegration: `const integration = await plyli.getIntegration(${pair});`,
    setIntegration: `const current = await plyli.getIntegration(${pair});\nconst integration = await plyli.setIntegration(${pair}, {\n  expectedVersion: current.version,\n  policy: { mode: 'private', allowPublicContext: false,\n    contextFields: [{ key: 'eventId', type: 'string', required: true }],\n  },\n});`,
    listKeys: `const credentials = await plyli.listKeys(${ws}, ${page});`,
    createKey: `const credential = await plyli.createKey(${ws}, {\n  name: 'Registration backend', scopes: ['forms:read', 'submissions:write'],\n  formIds: [${form}],\n});\n// Deliver credential.secret to your backend's secret store; it is shown only once.`,
    revokeKey: `const result = await plyli.revokeKey(${ws}, 'key_123');`,
    getRetention: `const retention = await plyli.getRetention(${ws});`,
    setRetention: `const retention = await plyli.setRetention(${ws}, {\n  responseRetentionDays: 90, trashRetentionDays: 7,\n});`,
    importBackup: `const backup = ${body} satisfies ImportBackup;\nconst imported = await plyli.importBackup(${ws}, backup);`,
  };
  return calls[endpoint.operationId];
}

export function makeExample(endpoint: ReferenceEndpoint, language: ExampleLanguage, origin: string, sessionCookieName: string): string {
  origin = parseApiOrigin(origin);
  const session = endpoint.access.includes('session');
  if (language === 'TypeScript SDK') {
    const setup = endpoint.public ? '' : session
      ? "// Run within the signed-in Plyli origin. The session's role is checked by the server.\n"
      : "// Server-side only. Set PLYLI_API_KEY in your backend's environment.\nconst apiKey = process.env.PLYLI_API_KEY;\nif (!apiKey) throw new Error('Set PLYLI_API_KEY');\n";
    return `import { PlyliClient${endpoint.operationId === 'createForm' ? ', type FormDefinition' : endpoint.operationId === 'importBackup' ? ', type ImportBackup' : ''} } from '@plyli/sdk';\n\n${setup}const plyli = new PlyliClient({\n  baseUrl: ${JSON.stringify(origin)},\n${endpoint.public ? '' : session ? '  session: {},\n' : '  apiKey,\n'}});\n\n${sdkCall(endpoint)}`;
  }
  const path = endpoint.path.replace(/\{(\w+)\}/g, (_, name: string) => ({ workspaceId: 'ws_123', formId: 'form_123', responseId: 'response_123', credentialId: 'key_123', slug: 'published_slug' })[name] ?? name);
  const url = `${origin}/api/v1${path}`;
  const body = endpoint.example === null ? undefined : JSON.stringify(endpoint.example, null, 2);
  if (language === 'cURL') return [
    `curl -X ${endpoint.method} '${url.replaceAll("'", "'\\''")}'`,
    ...(!endpoint.public ? [session ? `  --cookie '${sessionCookieName}=YOUR_SESSION_COOKIE'` : '  -H "Authorization: Bearer $PLYLI_API_KEY"'] : []),
    ...(endpoint.idempotency ? ["  -H 'Idempotency-Key: attempt_12345678'"] : []),
    ...(session && endpoint.method !== 'GET' ? [`  -H 'Origin: ${origin.replaceAll("'", "'\\''")}'`] : []),
    ...(body ? ["  -H 'Content-Type: application/json'", `  --data '${body.replaceAll("'", "'\\''")}'`] : []),
  ].join(' \\\n');
  const paginated = endpoint.parameters.some((parameter) => parameter.name === 'cursor');
  return `import type { PlyliClient } from '@plyli/sdk';\n\ntype Result = Awaited<ReturnType<PlyliClient['${endpoint.operationId}']>>;\n${!session && !endpoint.public ? "// Server-side only.\nconst apiKey = process.env.PLYLI_API_KEY;\nif (!apiKey) throw new Error('Set PLYLI_API_KEY');\n" : session ? '// Run within the signed-in Plyli origin.\n' : '// Public API: no credential is needed.\n'}const response = await fetch(${JSON.stringify(url)}, {\n  method: '${endpoint.method}',\n  credentials: '${session ? 'same-origin' : 'omit'}',\n  headers: {\n${!session && !endpoint.public ? '    Authorization: `Bearer ${apiKey}`,\n' : ''}${endpoint.idempotency ? "    'Idempotency-Key': 'attempt_12345678',\n" : ''}${body ? "    'Content-Type': 'application/json',\n" : ''}  },\n${body ? `  body: JSON.stringify(${body}),\n` : ''}});\nif (!response.ok) throw new Error(\`Plyli returned HTTP \${response.status}\`);\n// Fetch does not validate JSON at runtime; the SDK does.\nconst result: ${paginated ? 'Result' : '{ data: Result }'} = await response.json();\nconsole.log(result.data);`;
}

export const engineExample = `import { validateSubmission, resolveNextNodeId, type FormSchema } from '@plyli/sdk/engine';

// Any UI framework can render the published definition returned by the API.
export function inspectAnswers(form: FormSchema, answers: Record<string, string>) {
  const validation = validateSubmission(form, answers);
  const firstQuestion = form.questions[0];
  const next = firstQuestion ? resolveNextNodeId(form, firstQuestion.id, answers) : 'completion';
  return { validation, next };
}
// This runs locally. API submission still validates and authorizes on the server.`;

export const errorExample = `import { PlyliClient, PlyliError } from '@plyli/sdk';

const apiKey = process.env.PLYLI_API_KEY;
if (!apiKey) throw new Error('Set PLYLI_API_KEY');
const plyli = new PlyliClient({ baseUrl: 'https://plyli.example', apiKey });
try {
  await plyli.getForm('ws_123', 'form_123');
} catch (error: unknown) {
  if (!(error instanceof PlyliError)) throw error;
  if (error.status === 422) console.log(error.details);
  if (error.status === 429) console.log(error.retryAfter);
  console.error(error.code, error.requestId);
}`;
