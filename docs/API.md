# HTTP API v1

Base: `/api/v1`. Successful single-resource responses are `{ "data": ... }`. Lists are `{ "data": [...], "nextCursor": "..." | null }`. Errors are `{ "error": { "code", "message", "requestId", "details"? } }`. Every response includes `X-Request-Id` and `Cache-Control: no-store`. No stack traces, DB details or credentials are returned by error handlers.

Contracts: `core/contracts.ts`; OpenAPI: `/openapi.json` (generated using Zod JSON Schema). Versioned changes remain additive within v1; a breaking change requires v2. Definition schemaVersion and immutable revision numbers are separate from HTTP API version and optimistic form version.

## TypeScript client

The running instance’s `/api-reference` defaults to TypeScript SDK examples for every operation, with TypeScript Fetch and cURL alternatives. See the [SDK guide](../packages/sdk/README.md) for initialization, public and session access, pagination, errors, and the standalone engine. Stable operation identifiers match SDK method names in `packages/sdk/src/operations.ts`; `pnpm test:docs` compiles every generated TypeScript example against public SDK declarations.

## Authentication

Dashboard users send Better Auth cookies (`better-auth.session_token`, or `__Secure-better-auth.session_token` in production HTTPS). All cookie-authenticated mutation requests must send `Origin` exactly matching `BETTER_AUTH_URL` (normal same-origin browser fetch does this). Bearer credentials send `Authorization: Bearer plyli_...`; they are server-to-server secrets and never belong in client bundles. Invalid Authorization headers do not fall back to a session. Public endpoints below are anonymous and return only published definitions/receipts.

Scopes: `forms:read`, `forms:write`, `forms:publish`, `submissions:read`, `submissions:write`, `submissions:delete`, `analytics:read`. OWNER/EDITOR can manage forms; VIEWER can read. Only OWNER sessions administer keys, access policies and retention. Account imports permit owner/editor sessions. API keys cannot administer keys/policies/retention, provision workspaces or import account data. Optional formIds bind a key to selected workspace forms; form-bound keys cannot create forms. Supplied metadata confers no privileges.

| Method and path | Access | Behavior |
| --- | --- | --- |
| POST `/workspaces/personal` | Session | Body `{}`; provisions own workspace idempotently, returns `{id,name,role}`. |
| GET `/workspaces/{workspaceId}/forms` | forms:read | Active form documents; `limit` 1..100 (default 50), opaque ID `cursor`; `archived=true` selects archived forms. |
| POST `/workspaces/{workspaceId}/forms` | forms:write | `{definition}`; normalizes server revision/timestamps; ID conflicts return 409, never overwrite. |
| GET `/workspaces/{workspaceId}/forms/{formId}` | forms:read | `{definition,version,publicSlug,publishedRevision,archivedAt}`. |
| PUT `/workspaces/{workspaceId}/forms/{formId}` | forms:write | `{expectedVersion,definition}`; next full immutable revision, 409 on stale version. |
| DELETE `/workspaces/{workspaceId}/forms/{formId}` | forms:write | JSON `{expectedVersion}`; archives, retains responses/history. |
| POST `/workspaces/{workspaceId}/forms/{formId}/publish` | forms:publish | `{expectedVersion}`; validates workflow and pins draft revision; increments version. |
| POST `/workspaces/{workspaceId}/forms/{formId}/unpublish` | forms:publish | `{expectedVersion}`; closes public access; increments version. |
| GET `/workspaces/{workspaceId}/forms/{formId}/revisions` | forms:read | Paged `{revision,definition|null,legacySnapshot|null}`; numeric revision cursor. |
| GET `/workspaces/{workspaceId}/forms/{formId}/submissions` | submissions:read | Paged normalized engine records, including archived forms' responses. |
| GET `/workspaces/{workspaceId}/forms/{formId}/analytics-events` | analytics:read | Paged stored/imported behavioral events. No answers in events. |
| POST `/workspaces/{workspaceId}/imports` | OWNER/EDITOR session | Complete validated v2 workspace backup; atomic, max 5 MiB, 100 forms, 5,000 responses/revisions, 2,500 events. Preserves IDs; collisions/missing historical refs reject all. |
| POST `/workspaces/{workspaceId}/keys` | OWNER session | `{name,scopes,expiresAt?}`; secret shown once, future ISO expiry optional. |
| DELETE `/workspaces/{workspaceId}/keys/{credentialId}` | OWNER session | Revokes immediately; never returns hash/secret. |
| GET `/public/forms/{slug}` | Anonymous | Complete published definition; drafts/archived/unpublished forms return 404. |
| POST `/public/forms/{slug}/submissions` | Anonymous | Requires `Idempotency-Key` (8..128 alphanumeric/underscore/hyphen). See below. |

All IDs use bounded safe identifiers. JSON mutations require application/json. General bodies max 1 MiB, public submissions 128 KiB. Limits count streamed bytes even without Content-Length. Unknown input fields fail validation. Common codes: 400 invalid JSON, 401 absent/invalid credentials, 403 role/scope/origin, 404 unavailable or inaccessible resource, 409 version/ID/idempotency/revision conflict, 413 body too large, 415 media/encoding, 422 invalid contract/answers, 429 rate limit, 503 database unavailable.

Cursor lists sort stable IDs ascending (revisions numerically); nextCursor is exclusive. Pages are bounded, not a snapshot transaction. New insertions may require a fresh traversal. Dates are ISO 8601 UTC. There are no unbounded list endpoints, hard-delete endpoint, answer export endpoint, server analytics aggregate endpoint or live event-ingestion endpoint yet. The dashboard paginates retrieval and reuses existing export/report utilities. Form appearance is included in definitions; duplication uses create with a new ID.

## External integration example

```ts
import { PlyliClient, type SubmissionInput } from '@plyli/sdk';
import { validateSubmission } from '@plyli/sdk/engine';

export async function submitPublicAnswers(
  plyliOrigin: string,
  slug: string,
  answers: SubmissionInput['answers'],
  attemptId: string,
) {
  const plyli = new PlyliClient({ baseUrl: plyliOrigin });
  const form = await plyli.getPublicForm(slug);
  const validation = validateSubmission(form, answers);
  if (!validation.valid) throw new Error('Invalid answers');
  return plyli.submitPublic(slug, { revision: form.revision, answers }, attemptId);
}
// Generate attemptId once with crypto.randomUUID() and retain it with the exact
// payload for retries. A 409 requires reviewing the changed form or payload.
```

Run this from your backend or within the Plyli origin. Cross-origin browser API access is not enabled; use a backend proxy or the public form iframe for another website. Public access does not require an API key. Private integrations use the authenticated SDK methods on the host backend.

Submission input accepts revision, answers, durationSeconds?, attribution?, viewport?, sessionId?, externalContext?. Context must match the form's allowlist, required flags and scalar types. Anonymous context is rejected unless explicitly enabled. Input never accepts visitedQuestionIds or ownership/authorization claims. Unknown/skipped answer IDs are ignored by engine normalization; reachable required fields are validated server-side. Each response points to its exact revision.

The receipt is `{id,formRevision,submittedAt,replayed}`; first write is 201, identical replay 200. Reusing a key for a different payload returns 409. Unpublishing closes retries as well as new submissions. Raw request bodies and answer data never appear in audit records.

Authentication/key creation uses same-origin session calls. Example key body: `{ "name": "Event backend", "scopes": ["forms:read", "forms:write", "submissions:read"] }`. Save the returned secret in your external backend's secret store. Workspace IDs are selectors; the service also checks key ownership and requested scope. External respondent authentication/business operations stay with the host app. The headless engine can be used locally without hosted API calls; imports under core remain free of framework/database/browser dependencies.

## Private integrations and data controls

Use `/workspaces/{workspaceId}/forms/{formId}` as the prefix below. Private access is live and owner-controlled: anonymous `/public/forms/{slug}` and `/f/{slug}` return 404 for a private form. A published revision is still required for private integration submissions.

| Method/path suffix | Access | Behavior |
| --- | --- | --- |
| GET `/published` | forms:read | Authorized public/private published definition. |
| POST `/validate` | submissions:write | SubmissionInput; validates shared answer/branch rules and context without persisting. |
| POST `/submissions` | submissions:write | SubmissionInput plus Idempotency-Key; returns the usual typed receipt. |
| GET `/integration` | forms:read | `{version,policy}` including mode/public-context flag/typed allowed fields. |
| PUT `/integration` | OWNER session | `{expectedVersion,policy}`; applies access policy immediately, increments version, audits. |
| POST `/restore` | forms:write | `{expectedVersion}`; restores archived form without publishing it. |
| DELETE `/submissions/{responseId}` | submissions:delete | Move response to recoverable trash. |
| DELETE `/submissions` | submissions:delete | Move all active form responses to trash. |
| GET `/submissions/trash` | submissions:read | Cursor page of `{record,deletedAt}` recoverable responses. |
| POST `/submissions/{responseId}/restore` | submissions:delete | Restore within configured window; unavailable/expired/purged returns 410. |

GET forms accepts `archived=true` for archived documents. GET `/workspaces/{workspaceId}/keys` is owner-only, paginated and returns safe metadata. CreateKey optionally accepts `formIds` (nonempty array) or null for explicit workspace-wide access. GET/PUT `/workspaces/{workspaceId}/retention` is owner-only and reads/writes `{responseRetentionDays:number|null,trashRetentionDays:number}`. Active responses default to no age limit; trash defaults to 7 days. Purge erases answer/context payloads but retains minimal non-reusable idempotency tombstones. Replays of a deleted key return 410. See the recovery runbook for encrypted backup retention and restore limitations.

SDK and embedding examples: [Developer experience](DEVELOPER-EXPERIENCE.md). These additions are represented in the regenerated OpenAPI 3.1 document. HTTP 410 and formDocument.responseCount are additive v1 contracts.

## Throttling and privacy

Authenticated principal: 120 requests/minute. Credential authentication attempts: shared 600/minute. Anonymous: 1,200 requests/minute globally; reads 300/form/minute; submission attempts 60/form/minute. Counters are atomic shared MySQL state; 429 sends `Retry-After: 60` and optional retryAfter detail. No automatic browser retry of writes with a new idempotency key. Rate buckets expire and need the daily retention job. Unknown paths can consume quota.

Anonymous limits are deliberately form-wide until a trusted reverse-proxy/IP strategy exists; do not trust arbitrary forwarded IP headers. These limits and idempotency are an abuse baseline, not a complete spam defense. Add deployment-specific request limits and bot protection before public production exposure. Analytics event retention is 90 days; answers are separate. No raw IP is stored by Plyli behavioral analytics; Better Auth's session metadata follows its adapter defaults.
