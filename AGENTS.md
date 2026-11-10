# Plyli repository conventions

## Product language and design

- The product is **Plyli**. Use that name in UI, metadata, documentation, examples and generated assets.
- Never expose agent commentary, workstation paths, branch/commit identifiers, implementation phases, database setup, debugging instructions or temporary workarounds in product interfaces.
- Write concise, professional copy for the person using the feature. Keep necessary developer details in the API reference and integration guides; keep internal engineering notes separate.
- Describe available behavior accurately. Do not advertise unfinished features, unknown publication status or unavailable metrics. Preserve meaningful security, availability and data-loss warnings.
- Preserve the established paper design, themes, controls and inline editing. Reuse existing components and review desktop/mobile, loading, empty, error, confirmation and disabled states.
- Review user-facing copy and generated examples with every feature change. Do not display raw exceptions, stack traces, credentials or private environment values.

## Compatibility and branding

- Do not rewrite immutable history, user-authored form content, database identifiers, applied migrations or legacy storage keys for cosmetic branding.
- Keep compatibility aliases at input/storage boundaries only, with a clear comment and regression coverage. New exports and examples must use Plyli identifiers.
- Never blindly replace legacy strings in persisted data or migration checksums. Explain any remaining compatibility exceptions in local audit notes.

## Package management and SDK

- **pnpm** is the standard package manager. Respect the exact `packageManager` pin and commit `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
- Use pnpm for installation, dependency changes, scripts, documentation, automation and SDK packing. Do not add alternative package-manager lockfiles or installation commands.
- Use `pnpm install --frozen-lockfile` for reproducible installs. Review dependency versions and security changes when updating the lockfile. Allow dependency build scripts only after review.
- SDK source is in `packages/sdk`; run `pnpm sdk:sync` after changing shared core code. Never fork validation or branching behavior.
- Build/pack the SDK with pnpm and verify its public exports, declarations, engine behavior and production bundling from an isolated consumer outside the source tree.
- Validate public installation examples. Do not claim `@plyli/sdk` is published or show registry installation until publication is verified. Downloaded packages must use a real URL or a clearly explained saved path.
- Version SDK archive URLs when distributed contents change. Derive UI links from the package version and verify the exact HTTP URL in an isolated consumer; package-manager caches may retain a previous archive at a reused URL.
- Keep secrets server-side. Private integration credentials must never be bundled into browser applications.

## Documentation and Git hygiene

- Keep README, CONTRIBUTING, AGENTS, license files, API documentation, architecture decisions and useful user/developer/operator guides version-controlled. Never ignore all Markdown files.
- Put task lists, progress reports, private handoffs, scratch research and implementation summaries in ignored `.local-notes/`.
- Preserve existing local notes. For tracked temporary artifacts, use `git rm --cached` so local copies remain. Do not rewrite Git history to clean artifacts without explicit authorization.
- Keep dependencies, build output, SDK archives, database dumps, secrets, logs, screenshots and agent scratch assets out of Git. Regenerate the SDK archive during `pnpm sdk:package`/`pnpm build`; keep the OpenAPI contract reviewable.
- Do not commit, push, publish or deploy without explicit user approval.

## Validation

- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:sdk` and `pnpm build` as appropriate. Run database/auth/recovery regressions with `pnpm test:integration` against a dedicated `_test` database.
- Keep OpenAPI and the rendered reference synchronized with handlers. Use configured origins and label configurable connection settings.
- Do not reset a populated database, overwrite a restore target or remove user data to make tests pass.
- Report only checks actually executed and disclose unresolved limitations. Preserve self-hosting portability; avoid workstation-specific assumptions in source and public guides.

## Repository quality and API documentation

- Preserve the MIT license, third-party attribution and authorship history. Follow SECURITY.md for private vulnerability reports. Never conceal development provenance or rewrite history for cosmetic cleanup.
- Remove obsolete scaffolding and unused dependencies only after checking imports and runtime entry points. Preserve meaningful technical decisions and comments about constraints; avoid narration of obvious code.
- API operations have stable identifiers in packages/sdk/src/operations.ts. Keep every implemented operation mapped to a real typed client method and all reference languages. Public endpoints omit credentials; session-only operations must never be documented as key-authenticated.
- TypeScript SDK is the default reference language, followed by TypeScript Fetch and optional cURL. Preserve the language preference and the established paper design.
- Run pnpm test:docs to compile every generated TypeScript example against public SDK declarations. Extend the SDK/API contract integration test when adding operations and run the isolated archive consumer check before distribution.
