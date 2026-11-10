# Data management and recovery

## Responses, archives and conflicts

Responses move to recoverable trash and are excluded from active reports. Owners can retain active responses indefinitely or choose an age limit. The default trash window is seven days; available windows are 1–30 days. After that window, answer, context and attribution payloads are permanently erased. Minimal revision/idempotency records remain so retries cannot recreate deleted answers. Backups have a separate retention period and can still contain subsequently deleted data.

Archive preserves forms, revisions and responses while disabling public access. Restore produces an unpublished draft. Save conflicts retain local work and offer a three-way review: independent fields combine, overlapping fields require a choice, and questions are kept as a consistent unit. Saving a resolved draft still checks the latest version.

## Encrypted backups

Configure `PLYLI_BACKUP_DIR` as an absolute directory outside the repository, `PLYLI_BACKUP_KEY` as 32 random bytes encoded in hex, and MySQL command-line utilities through `PLYLI_MYSQL_BIN` and `PLYLI_MYSQLDUMP_BIN` (or place `mysql`/`mysqldump` on PATH). Keep the encryption key separately from backups. Losing it makes backups unreadable. Backups contain identity, session and credential tables and require restricted operator access.

```sh
pnpm backup:create
pnpm backup:verify '<absolute-path-to-manifest.json>'
pnpm backup:restore-test '<absolute-path-to-manifest.json>'
pnpm maintenance
```

The scripts stream a consistent InnoDB dump through gzip and AES-256-GCM without writing plaintext SQL to disk. Manifests record ciphertext integrity and authentication metadata. Verification authenticates/decompresses the complete backup before any SQL runs. Avoid concurrent schema changes during backup creation.

Restore tests create a new randomly named `plyli_*_restore_test` database. Existing or unsafe targets are refused. Schema and historical references are checked, then only the generated test database is removed. The maintenance identity needs CREATE/DROP permissions; the runtime application identity should not.

Maintenance verifies an isolated restore before applying response retention, 90-day behavioral-event expiry and rate-bucket cleanup. Encrypted backups are kept for seven days by default, retaining at least the newest. Configure `PLYLI_BACKUP_RETENTION_DAYS` for your needs. Failures stop retention, and status/logs are written to ignored `.tmp/maintenance/`.

## Scheduling

Schedule `pnpm maintenance` using the deployment scheduler after validating it manually. On Windows, `scripts/maintenance.ps1` invokes the same Node entry point without depending on an interactive package-manager PATH. `scripts/install-maintenance.ps1` accepts a local daily run time and registers a current-user task with StartWhenAvailable and overlapping runs disabled. The machine, user session, database and configured utilities must be available. On Linux, use an appropriate scheduler/service identity.

Local disk backups do not provide offsite disaster recovery. Copy encrypted backups to an independently protected destination and secure the key separately. Monitor last-success status and scheduler failures.

## Recovery procedure

Authenticate the chosen backup, restore into a new database, and verify exact records, revision links and application behavior. Take the application offline before switching its database configuration. Reconcile deletion obligations and revoke/rotate sessions or credentials when appropriate. Never overwrite a live database as a test.

The automated suites verify exact restored rows, wrong-key/tamper rejection, refusal to overwrite unsafe/existing targets, revision integrity, trash restoration, purge behavior and replay protection. Configure a dedicated `_test` database and backup utilities before running `pnpm test:integration`.

Applied/shared migrations are immutable. Review new SQL before deployment, and never reset a populated database to resolve drift.
