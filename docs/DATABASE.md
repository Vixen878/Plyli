# Database relationships

Prisma/MySQL schema: `prisma/schema.prisma`. Initial migration: `prisma/migrations/20261103222127_backend_foundation/migration.sql`.

| Model | Purpose and invariants |
| --- | --- |
| User, Account, Session, Verification, RateLimit | Better Auth adapter models. Provider/account pair unique; sessions token unique, expire and revoke on sign-out. OAuth tokens encrypted by Better Auth. Session/account deletion can cascade from users; workspace ownership restricts user deletion. |
| Workspace | Unique optional personalOwnerId provisions a personal workspace once; organizations can later omit it. Nullable responseRetentionDays defaults to unlimited; trashRetentionDays defaults to seven days. |
| Membership | Composite workspace/user primary key; OWNER, EDITOR, VIEWER. Tenant selectors never bypass membership checks. |
| Form | Global stable ID, workspace FK, version counter, draftRevision, publishedRevision, unique random publicSlug, archivedAt. Archive retains history. Live integrationPolicy controls public/private access and contextual metadata independently of published content. |
| FormRevision | Composite workspace/form/revision primary key. Full JSON definition is immutable in normal operation. Imported legacySnapshot can be partial; definition stays null when unknown. Complete account backups preserve fullRevisions. |
| Submission | Composite FK to exact workspace/form/revision; unique workspace/form/idempotencyKey; request hash detects conflicting replay; normalized engine record stored as JSON. deletedAt records recoverable trash; purgedAt marks erased payloads while preserving the idempotency key. Workspace/deletion/time index supports retention. |
| AnalyticsEvent | Separate JSON event, no raw answer fields; revision FK and workspace/form/time indexes. Reports use recorded/imported events; there is no public ingestion endpoint. |
| ApiCredential | Unique SHA-256 key hash; only a display prefix retained, scoped to one workspace, with expiry, revocation and last use. Optional formIds restrict access to specific forms. Creation response reveals the random secret once. |
| AuditEvent | Workspace/actor/action/resource/time for creation, publishing, archive, imports and credential administration; no submitted answers/secrets. |
| RateLimitBucket | Atomic MySQL upsert counter, hashed identity/window, expiry index. Shared across application processes. |

All domain foreign keys use RESTRICT. There is no cascade-delete of submissions, historical revisions or analytics. Draft/published pointers are checked transactionally in services (MySQL cannot defer the circular insert constraints that a form->initial-revision->form FK would require). Revision rows have no mutation endpoint; only the all-or-nothing import transaction may attach a previously supplied legacy/full definition before commit. Direct database access must remain limited to trusted operators.

Draft update compares expectedVersion in a conditional UPDATE and inserts the next full snapshot in the same transaction. Publish checks the shared publishable schema and moves the pointer. Submission uses a current locking read of Form to serialize with publish/unpublish/archive, compares the submitted revision, derives the active answer path through the pure engine, then persists the response. Idempotent replays return the original receipt; a different payload with the same key is rejected. No user-provided workspace/user identity is trusted from form metadata or answers.

Schema JSON is bounded and validated in `core/contracts.ts` at request/read boundaries. Legacy snapshots retain deleted question labels and choices for historical response rendering. No relation table is needed per question/property because the platform reads, renders, validates and versions complete definitions.
