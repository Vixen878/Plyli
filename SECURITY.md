# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/Vixen878/Plyli/security/advisories/new). Include affected versions, reproduction steps, impact, and a minimal example with synthetic data. Do not include real credentials, respondent answers, database dumps, or personal information.

If private reporting is unavailable, contact the repository owner privately through their GitHub profile and request a secure reporting channel. Do not post exploit details in a public issue. Ordinary bugs and feature requests belong in GitHub Issues.

## Supported releases

Security fixes target the current main branch. There is no long-term support policy or guaranteed response time yet. Review dependency advisories and deployment configuration before exposing an instance publicly.

## Operating an instance

Use HTTPS, a dedicated database account, strong authentication secrets, scoped server-side API keys, trusted proxy configuration, request limits, and encrypted backups. Test restores into a new isolated database. Never place private keys in browser bundles. See [deployment setup](README.md) and [backup operations](docs/BACKUPS-AND-RECOVERY.md).
