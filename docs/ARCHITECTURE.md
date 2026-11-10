# Plyli architecture

## Application structure

Plyli uses Next.js App Router, React, strict TypeScript and Tailwind. Existing paper controls and sixteen appearance themes are shared across the builder, visual/rule flow editors, previews, public renderer and response reports.

The core modules implement question types, validation, branching, workflow traversal, normalization, immutable response references, migrations, history, analytics and attribution. They have no React, Next.js, database, browser storage or authentication dependency. `lib/form-engine.ts` re-exports the engine and supplies starter templates.

The authenticated workspace uses asynchronous API calls with explicit saves and optimistic version checks. Browser recovery uses its separate synchronous storage adapter. These adapters are intentionally separate: replacing a synchronous local adapter with remote side effects would obscure save failures and risk overwriting account data.

## Persistence and identity

Request handlers pass shared Zod contracts through session/key authorization into Prisma services and MySQL. Better Auth manages Google identities and signed sessions. Workspace memberships support owner, editor and viewer roles. Every resource query constrains workspace identity; metadata is never authorization.

Forms store draft/publication pointers and an optimistic version. Each revision stores the complete form definition as JSON, including appearance and branching. Questions are versioned with the document rather than normalized into independently mutable rows. Legacy imported snapshots can be partial; unavailable historical settings are never reconstructed from a current form.

Submissions reference the exact workspace/form/revision through restrictive foreign keys. Server validation derives the reachable branch path and normalizes answers. Caller-provided visited IDs cannot bypass required questions. A current locking read serializes submissions against publish/unpublish/archive and live access-policy changes. Idempotency keys and payload hashes prevent duplicate/conflicting writes.

API keys are random, stored only as hashes, scoped to operations and optionally selected forms. Owner sessions control credentials, integration policies and retention. Public forms permit anonymous published reads/submissions; private integrations require authorized server-side credentials. The policy is a live access boundary separate from the immutable published definition.

## Recovery and compatibility

Archive preserves revision/response history; restoring does not republish. Responses are recoverable during a configurable trash window before payload erasure. Minimal idempotency records prevent retries from resurrecting deleted answers. Encrypted backups are verified through isolated restores before maintenance applies retention.

Three-way conflict review compares base, local and latest definitions. Independent fields combine; competing question structures require an explicit choice. A resolved draft still checks the latest server version when saved.

Legacy browser storage keys and old backup markers remain readable. New exports use Plyli. User-authored content, historical revisions and applied migrations are not cosmetically rewritten. Import collisions fail atomically rather than overwriting records. See [database details](DATABASE.md) and [recovery](BACKUPS-AND-RECOVERY.md).

## API and SDK

`/api/v1` is the stable REST boundary. Shared contracts generate the OpenAPI document and feed the rendered `/api-reference`. Cookie mutations require the configured origin; scoped bearer requests are server-to-server. Lists use bounded cursors; JSON body limits, shared rate buckets and structured errors apply at the boundary.

`packages/sdk` is a pnpm workspace package. Its generated core sources come from `pnpm sdk:sync`; it does not maintain a second validation engine. The SDK's only runtime dependency is Zod. Builds regenerate the SDK archive with declarations and explicit ESM exports. Released versions are available from [npm](https://www.npmjs.com/package/@plyli/sdk).

pnpm uses the hoisted linker specified in `.npmrc` so Next.js standalone packaging works on Windows without symlink privileges. The workspace lockfile pins dependency resolution; linker choice does not change the application stack or the standalone engine contract.

## Operational boundaries

Behavioral analytics calculations are reusable, but reports can only show recorded/imported events. Public submission attribution works separately; no live behavioral ingestion endpoint is advertised. Reverse-proxy trust, traffic-level abuse controls, offsite backups, load testing and deployment-specific OAuth verification remain deployment responsibilities.

Keep raw answers and secrets out of audit logs and errors. Preserve restrictive foreign keys, immutable history, explicit publishing and no-overwrite restore targets. Prisma/toolchain major upgrades require separate compatibility and security review.
