# Plyli

Plyli is a paper-inspired form builder with branching questions, appearance themes, published forms, response management, and an API for embedding questions in other applications. Its TypeScript form engine works independently of the web application.

## Setup

Use Node.js 22.14+ or 24+, MySQL 8+, and pnpm **10.25.0**, pinned in `package.json`. Enable Corepack if your Node distribution provides it, or use an existing installation of the pinned pnpm version.

```sh
pnpm install --frozen-lockfile
# Copy .env.example to .env and configure your own database and authentication.
pnpm db:deploy
pnpm dev
```

Create a database and a dedicated password-protected MySQL user. Set `DATABASE_URL` in `.env`; URL-encode password characters. For integration tests, create a separate database ending in `_test` and set `TEST_DATABASE_URL`. Never use a production database for tests.

An optional local database is provided in `compose.yaml`. Set `PLYLI_MYSQL_PASSWORD`, run `docker compose up -d`, and configure the app to connect to its published port, 3308. This avoids the common 3306 port used by an existing MySQL installation. The Compose service creates the development database; test database permissions are separate.

Set `BETTER_AUTH_URL` to the origin where you run Plyli and generate a strong `BETTER_AUTH_SECRET`. For Google sign-in, configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and register `<BETTER_AUTH_URL>/api/auth/callback/google` with Google. Use HTTPS in production. Restart the app after changing environment configuration.

The default development port is 3000. If it is occupied, run `pnpm dev --port 3011` (or another free port) and use the same origin for authentication and its callback.

## Workspaces and forms

The home route opens the authenticated workspace. Create or import forms, edit questions and branching, choose a theme, and save drafts. Publish to share `/f/<publicSlug>`. Editing a draft does not change the published revision until you publish again. Public submissions are validated and normalized on the server using the shared engine.

Preview answers are separate from published responses. Responses can move to recoverable trash; archived forms can be restored without republishing. Version conflicts preserve your draft and let you review competing edits. Portable backups preserve form definitions, revisions and active responses. The `/local` recovery workspace can export data previously saved on the same device; it never automatically overwrites account data.

Developers manages scoped API keys. Integration settings control public/private access and permitted context fields. Private integrations use a key on the host application's server; the host remains responsible for its own users and authorization.

## SDK and API

Browse `/api-reference` for endpoint schemas and examples, or download `/openapi.json`.

### Official npm package (recommended)

```sh
pnpm add @plyli/sdk
```

The [official SDK](https://www.npmjs.com/package/@plyli/sdk) works with any compatible Plyli server. Set `baseUrl` on `PlyliClient` to the server you want to use, including a self-hosted deployment.

### Self-hosted SDK archive (alternative)

If you need the SDK build that ships with a particular instance, install its versioned archive.

```sh
pnpm add 'https://your-plyli-instance.example/downloads/plyli-sdk-0.2.2.tgz'
```

Replace the example origin with your Plyli server. The archive is optional for self-hosted deployments. To rebuild the archive for your own instance, run `pnpm sdk:package` from the Plyli repository. See the [SDK guide](packages/sdk/README.md) and [integration guide](docs/DEVELOPER-EXPERIENCE.md).

## Checks and migrations

```sh
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm test:sdk
pnpm test:docs
pnpm test:integration
pnpm build
```

Use `pnpm exec prisma migrate dev --name descriptive_change` when authoring a local migration, review the SQL, and deploy with `pnpm db:deploy`. Never reset a populated database or edit a migration that has been shared or deployed.

`pnpm build` regenerates the SDK download and OpenAPI, generates the Prisma client, then builds Next.js. The pnpm workspace lockfile is authoritative; no package publication occurs.

## Guides and deployment

- [Architecture](docs/ARCHITECTURE.md), [database relationships](docs/DATABASE.md), [HTTP API](docs/API.md)
- [Integrations](docs/DEVELOPER-EXPERIENCE.md), [backups and recovery](docs/BACKUPS-AND-RECOVERY.md)
- [Contributing](CONTRIBUTING.md), [security reporting](SECURITY.md), [repository conventions](AGENTS.md)

Before public deployment, configure trusted proxy headers, request limits, abuse protection, Google callback origins, encrypted backups and offsite recovery. Current behavioral reports use recorded/imported events; there is no public behavioral-event ingestion endpoint. Response attribution is supported independently. Do not treat missing session metrics as zero engagement.

Review the dependency audit before a release. Known advisories remain in Prisma’s deepmerge-ts configuration dependency and ESLint’s minimatch dependencies. Their published fixes require major dependency changes; review them before a release rather than forcing incompatible overrides.

For a standard production server, run `pnpm build` followed by `pnpm start`, matching its port/origin to your authentication configuration. If deploying the generated standalone server, include `public/` and `.next/static/` beside the standalone output as required by Next.js. The generated SDK archive is served from `public/downloads`.

`pnpm dev` also prepares the SDK download and OpenAPI document, so a fresh checkout has working documentation and download links.

## License

Plyli is licensed under the [MIT License](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for dependency and asset attribution.
