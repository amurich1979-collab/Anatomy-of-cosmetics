# C14: operational checklist

This is an engineering runbook, not evidence that the public deployment has been checked.

## Required production environment

| Variable | Purpose | Check |
| --- | --- | --- |
| `NODE_ENV=production` | Secure cookies and fail-closed startup | Never run production as development |
| `HOST`, `PORT` | Bind address and assigned port | Reach `/health` through the ingress |
| `APP_URL` | Canonical HTTPS origin for OAuth and reset links | Must be public HTTPS origin |
| `SESSION_SECRET` | Stable HMAC key for 30-day session cookies | At least 32 characters, kept between restarts |
| `DATABASE_URL` | Persistent PostgreSQL | Mandatory in production; backup policy belongs to DB operator |
| `DATABASE_SSL` | PostgreSQL TLS mode | `false` only on a trusted local test network |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | Password-reset delivery | Configure and test with a real inbox before release |
| `SMTP_USER`, `SMTP_PASS` | Optional SMTP credentials | Set both or neither; do not print |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google login | Check callback and test user on actual origin |
| `REVIEW_ADMIN_EMAILS` | Review-queue access | Comma-separated allowlist; empty means no admin access |

Do not put credentials in source control, logs, screenshots, or support tickets. The local `APP_DB_PATH` override is only for non-production isolated tests.

## Local verification

1. `npm ci`
2. `npm run check`
3. `npm test`
4. `npm run test:c14` checks isolated file storage, actual SMTP protocol delivery to a local fake server, history after restart, a copied backup restored into a second file database, access controls, session expiry, rate limit, source outage, and health on corrupt storage. It does **not** test managed PostgreSQL or an external email provider.
5. For the PostgreSQL production smoke, provision **two empty disposable databases** with different names beginning `c14_`; install `pg_dump` and `pg_restore`; set `C14_SOURCE_DATABASE_URL`, `C14_RESTORE_DATABASE_URL`, `C14_SESSION_SECRET`, and `DATABASE_SSL`; then run `npm run smoke:c14`. The script refuses non-empty databases and never drops or cleans them. It launches with `NODE_ENV=production`, creates a test account, analyzes a short formula, checks history after restart, dumps the first database, restores into the second and checks history there. Do not use a real user database. Inspect and remove both test databases after the run.
6. On the actual host, check `/health`, register/login/logout, Google callback if enabled, personal-data retention and deletion, reset email in a real inbox, and a failed external source. Do not infer this from local smoke.

`/health` returns 503 when the database query/read fails, without revealing database URLs or user data. The configured rate limits are process-local: login/register 10 per 15 minutes, reset 5 per 15 minutes, lookup 60 per minute, analysis 30 per minute, review request 10 per hour. Multi-instance deployments need a shared limiter store before opening to uncontrolled traffic.

## Backup and restore

Use the managed PostgreSQL provider's automated backups and retention policy. Schedule an independent restore drill into a fresh isolated database. The C14 script tests a logical `pg_dump`/`pg_restore` of disposable data; it does not establish a production recovery point objective, recovery time objective, or automatic backup schedule. Verify encryption, access to backups, retention, and deletion with the host operator. File-mode storage is for local development only.

## Privacy, licenses and RF review

The following are questions for the responsible legal/privacy and subject-matter specialists, not legal conclusions or permissions to publish:

- Inventory account email, Google profile, search/history, user-supplied labels/photos, and optional skin profile. Confirm data minimization, retention/deletion, access requests, notices and consent language. Verify whether the operator must notify Roskomnadzor and what hosting/data-location and cross-border-transfer rules apply to the actual setup. [Roskomnadzor operator guidance](https://82.rkn.gov.ru/directions/pers/p15375/) is a starting point; current requirements and exceptions require specialist review.
- Confirm the origin, reuse terms, attribution, caching, images, API limits and commercial-use rights for each source listed in `DATA_SOURCES.md`: Open Beauty Facts, Open Products Facts, UPCitemdb, INCI Decoder, official brand pages, web discovery, and CosIng. Do not assume public access grants permission to republish descriptions or photos. Record the exact terms/version and owner approval for each source before launch.
- CosIng is an informative ingredient database, not a product approval or stand-alone legal determination; have a qualified reviewer validate any regulatory or safety claim against the applicable primary rules. [European Commission CosIng notice](https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en).
- Review the boundary between cosmetic explanation and medical advice, advertising claims, expert approvals, and liability wording for the RF audience. Verify that source attribution and differing formula versions remain visible to users.

No real host credentials, mailbox delivery, source-license grant, RF compliance opinion, or specialist sign-off is supplied by this document.
