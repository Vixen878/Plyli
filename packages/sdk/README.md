# Plyli TypeScript SDK

Plyli provides a typed HTTP client and a standalone form engine. Use the client to communicate with a running Plyli server; use the engine for validation and branching in your own interface.

## Install

Requires an ESM project and Node.js 22 or later.

### Official npm package (recommended)

```sh
pnpm add @plyli/sdk
```

Set `baseUrl` on `PlyliClient` to any compatible Plyli server, including a self-hosted deployment.

### Self-hosted SDK archive (alternative)

If you need the SDK build that ships with a particular instance, install its versioned archive.

```sh
pnpm add 'https://your-plyli-instance.example/downloads/plyli-sdk-0.2.1.tgz'
```

Replace the example origin with your Plyli server. The archive is optional for self-hosted deployments. You can also download it and run `pnpm add '<full-path-to-downloaded-archive>'`.

For a new Node.js TypeScript project, add the compiler and Node declarations with `pnpm add -D typescript @types/node` if they are not already configured. Use `@plyli/sdk` for the client and `@plyli/sdk/engine` for the engine. A CommonJS application can load these ESM exports using dynamic `import()`.

## Server-side API client

```ts
import { PlyliClient, PlyliError } from '@plyli/sdk';

const apiKey = process.env.PLYLI_API_KEY;
if (!apiKey) throw new Error('Set PLYLI_API_KEY');
const plyli = new PlyliClient({
  baseUrl: 'https://your-plyli-instance.example',
  apiKey,
  timeoutMs: 15_000,
});
const published = await plyli.getPublishedForm('ws_123', 'form_123');
const attemptId = crypto.randomUUID(); // Preserve this key and payload for retries.
const input = {
  revision: published.revision,
  answers: { [published.questions[0].id]: 'Avery' },
};
const validation = await plyli.validateSubmission('ws_123', 'form_123', input);
if (validation.valid) {
  const receipt = await plyli.submit('ws_123', 'form_123', input, attemptId);
  console.log(receipt.id, receipt.replayed);
}
```

Use real resource IDs and answer values matching the published question types. Private integrations must include required `externalContext` fields matching their typed allowlist. Context is metadata, not authorization. Your application must authorize its own users. Never expose keys in browser code; the client rejects browser key configuration.

`baseUrl` accepts the server origin or its `/api/v1` URL. Remote servers require HTTPS; HTTP is accepted for loopback development. Configuration rejects credentials in URLs, invalid timeouts, and conflicting authentication modes. Timeout defaults to 15 seconds. Supply a custom `fetch` transport when needed.

## Public and session access

Public clients need no credential:

```ts
const publicClient = new PlyliClient({ baseUrl: 'https://your-plyli-instance.example' });
const publicForm = await publicClient.getPublicForm('published_slug');
// publicClient.submitPublic(slug, input, idempotencyKey)
```

Owner actions require a signed-in Plyli session, not an API key. In a browser on the same Plyli origin:

```ts
const sessionClient = new PlyliClient({ baseUrl: window.location.origin, session: {} });
const workspace = await sessionClient.provisionWorkspace();
```

On a trusted application server, forward the incoming Plyli request's Cookie header explicitly using `session: { cookie: request.headers.get('cookie') ?? '' }`. The SDK supplies the matching Origin for session writes. Do not forward unrelated cookies, log session headers, or send them to an untrusted origin. Public calls omit all credentials even when the client is configured with a session or key.

## Operations and permissions

Every implemented API operation has a client method. The running instance's `/api-reference` provides compiled TypeScript examples, request/response schemas and permission requirements for all methods.

| Capability | Methods | Access |
| --- | --- | --- |
| Workspace | `provisionWorkspace` | Signed-in session |
| Drafts and archive | `listForms`, `iterateForms`, `getForm`, `createForm`, `saveDraft`, `archiveForm`, `restoreForm` | Matching forms read/write scopes |
| Publishing | `publish`, `unpublish`, `getPublishedForm`, `listRevisions` | forms:publish or forms:read |
| Validation and responses | `validateSubmission`, `submit`, `listSubmissions`, `deleteResponse`, `deleteAllResponses`, `listDeletedResponses`, `restoreResponse` | Matching submissions scope |
| Analytics | `listAnalyticsEvents` | analytics:read |
| Integrations | `getIntegration`, `setIntegration` | forms:read / owner session |
| Credentials | `listKeys`, `createKey`, `revokeKey` | Owner session |
| Retention | `getRetention`, `setRetention` | Owner session |
| Backups | `importBackup` | Owner/editor session |
| Public forms | `getPublicForm`, `submitPublic` | Anonymous public flow |

A key is restricted to its workspace, scopes and optional form allowlist. Changes require the latest `expectedVersion`; reload and review a 409 conflict before saving. Published submissions use the exact rendered revision. SDK writes are not retried automatically. Reusing an idempotency key with a changed payload returns 409.

List methods return `{ data, nextCursor }` and accept `{ limit, cursor }`. Limit is 1–100. `listForms` also accepts `archived: true`; it lists active forms by default. `listRevisions` uses numeric cursors; other cursors are strings. Null ends pagination.

```ts
const first = await plyli.listSubmissions('ws_123', 'form_123', { limit: 25 });
if (first.nextCursor) {
  const next = await plyli.listSubmissions('ws_123', 'form_123', { cursor: first.nextCursor });
  console.log(next.data);
}
for await (const document of plyli.iterateForms('ws_123')) console.log(document.definition.title);
```

Analytics events and response UTM attribution are readable. There is no public behavioral-event ingestion endpoint or workspace export endpoint. Export backups in Plyli's UI; use `importBackup` to import them. A general workspace directory or team-management API is not implemented.

## Headless engine

```ts
import { validateSubmission, resolveNextNodeId, type FormSchema } from '@plyli/sdk/engine';

export function inspectAnswers(form: FormSchema, answers: Record<string, string>) {
  const validation = validateSubmission(form, answers);
  const first = form.questions[0];
  const next = first ? resolveNextNodeId(form, first.id, answers) : 'completion';
  return { validation, next };
}
```

Render question types in React, Vue, Svelte, or another framework. Keep answers keyed by question ID, display validation errors, and move to the next node returned by the engine. Required questions skipped by valid branching are not required in the submitted path. Local validation does not authorize a submission; the API validates again. The engine imports no React, database, browser storage, or application server modules.

## Types and errors

Public exports include `FormDefinition`, `FormSchema`, `FormDocument`, `SubmissionInput`, `SubmissionReceipt`, `ValidationResult`, `Pagination`, `Page`, `RevisionRecord`, `IntegrationPolicy`, `IntegrationSettings`, `ApiScope`, `CreateKeyInput`, `KeyInfo`, `RetentionSettings`, `AnalyticsEvent`, and `ImportBackup`. Engine exports include the shared runtime schemas.

`PlyliError` exposes `status`, `code`, `message`, `requestId`, `details`, and `retryAfter`. Network failures use status 0 with `NETWORK_ERROR` or `TIMEOUT`; malformed payloads use `INVALID_RESPONSE`. HTTP errors retain the server envelope. Invalid local inputs raise ZodError; invalid configuration raises TypeError or ZodError.

```ts
try {
  await plyli.getForm('ws_123', 'form_123');
} catch (error: unknown) {
  if (!(error instanceof PlyliError)) throw error;
  if (error.status === 422) console.log(error.details);
  if (error.status === 429) console.log(error.retryAfter);
  console.error(error.code, error.requestId);
}
```

## License

MIT. See [LICENSE](LICENSE). Dependencies retain their own license notices.
