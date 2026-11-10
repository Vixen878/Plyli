# Integrating Plyli into another application

The `/api-reference` page provides searchable endpoints, authentication requirements, expandable request/response fields, status codes, and TypeScript SDK examples by default, TypeScript Fetch alternatives, and optional cURL examples. `/openapi.json` remains the machine-readable contract. The reference links the SDK setup, error handling and standalone engine guides.

The Developers page manages API keys. Each key has scopes, expiry, display prefix and selected form IDs (or explicitly granted workspace-wide access). Secrets are displayed once and stored only as hashes. Listing keys never returns a secret/hash. Form-bound keys cannot create new forms or access a different form; lists are filtered as well as resource routes.

For a host registration/event/customer application:

1. Build and publish the additional questions in Plyli.
2. Open Integration in the editor. Choose Private integration and define typed allowed metadata keys, for example required strings eventId and registrationId.
3. Create a form-bound key with forms:read and submissions:write. Keep it in the host backend's environment.
4. Your backend calls `plyli.getPublishedForm(workspaceId, formId)`. Render it in your own frontend. Your application retains its login and business lifecycle.
5. Authorize the respondent in your backend and derive contextual IDs from trusted application state.
6. Validate with the headless engine or `plyli.validateSubmission`, then call `plyli.submit` with the exact published revision and a stable idempotency key.

Private mode makes anonymous definition reads, `/f/{slug}` and public submissions return 404 immediately. Changing access policies requires an owner session, expectedVersion, and an audit entry. A forms:write key cannot make a private form public. The definition is an immutable published revision; the policy is a live security boundary.

Context supports string/number/boolean values, required flags, at most 20 fields, bounded keys and strings up to 255 characters. Unknown keys and wrong types fail shared validation. Public forms reject context by default; owners can explicitly allow optional unverified public context. Required context needs private mode so the hosted public renderer is never blocked by application-only data. Metadata never grants access to a Plyli user/workspace. Context remains in the response, separate from behavioral events.

The SDK source is in `packages/sdk`. `@plyli/sdk` provides the HTTP client and `@plyli/sdk/engine` provides the standalone engine and contracts. Run `pnpm sdk:sync` after core changes and `pnpm sdk:package` to rebuild the download. The package is ESM-only with TypeScript declarations; Zod is its only runtime dependency. See [the SDK guide](../packages/sdk/README.md) for archive installation commands and runtime requirements. This build is not published to the registry.

Use getPublicForm/submitPublic only for explicitly public forms. Private integrations are server-to-server; no cross-origin browser API-key workflow is provided. A public renderer iframe is appropriate only for public forms. Private forms render in your host UI with backend-mediated data access.

Host transactions and Plyli writes are separate. Persist the attempt ID and serialized payload in your host system, reuse both on retries, and record the receipt ID. No distributed transaction is implied. SDK errors retain status/code/requestId/details: 409 requires reviewing revision changes, 410 means the response was deleted, and 429 requires waiting for the rate window. Private keys never belong in a client bundle.
