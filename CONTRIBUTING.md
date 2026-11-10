# Contributing to Plyli

Use Node.js 22.14+ (or Node.js 24+) and pnpm **10.25.0**, as pinned in `package.json`. If your Node distribution includes Corepack, `corepack enable` enables its package-manager shims. Otherwise install the pinned pnpm version using pnpm's official installation guide.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Follow [setup](README.md), [architecture](docs/ARCHITECTURE.md) and [repository conventions](AGENTS.md). Keep the shared engine independent of the web framework and database. Preserve existing storage/import compatibility and immutable form history.

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

Integration tests require a dedicated MySQL database ending in `_test`, an encryption key and MySQL command-line utilities. They create only their own fixtures and isolated restore targets. Never point them at a production database.

After changing core contracts, run `pnpm sdk:sync`, `pnpm api:spec` and the integration/consumer checks. SDK source lives in `packages/sdk`; `pnpm sdk:package` rebuilds its downloadable archive. Do not edit generated SDK sources by hand.

Review copy, keyboard access and responsive states alongside functional changes. Keep public documentation useful and put private progress notes in `.local-notes/`. Check `git status` before submitting changes; never include credentials, dumps, local notes or generated binaries.

## Changes and review

Open an issue for substantial changes before implementation. Keep pull requests focused, explain the resulting behavior, and include relevant verification. Add regression coverage for authorization, contracts, data preservation, or engine behavior when changing them. Security reports belong in the [private reporting process](SECURITY.md).

Contributions are provided under the project’s [MIT License](LICENSE). Preserve existing copyright and dependency notices, and identify any third-party code or assets you add.
