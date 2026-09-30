# V1 release-readiness review

Review date: 2026-09-29. Historical baseline below; the authentication rate-limit
milestone update is at the end. The user subsequently confirmed hosted GitHub
Actions and local browser/frontend checks passed for that baseline.
This review inspected source, schemas, services,
migrations, tests and configuration and reran verification from a source-only
copy. The user's real-browser confirmation is recorded as user-provided evidence;
this review did not perform an independent browser or production test.

## Findings by importance

| Priority | Finding | Resolution / remaining work |
| --- | --- | --- |
| High, deployment gate | Authentication rate limiting was missing; ingress body/concurrency controls still needed | PostgreSQL limiter now implemented (see milestone update); 0007 approved and applied locally. Configure proxy trust/cleanup before deployment; ingress controls remain |
| High, dependency | npm audit identified vulnerable PostCSS through Next, including arbitrary source-map file reads | Added an exact PostCSS 8.5.28 override, preserving Next 15.5.26 and installed React versions; clean build/tests/audit passed. No forced major upgrade |
| High, reproducibility | Three tracked UI harnesses required ignored jsdom; 57 checks lived only in .local-checks; no CI | Promoted harnesses to frontend/tests, locked jsdom, added npm test runner and PR/push CI with immutable action SHAs |
| Medium, error handling | useApi's 401 catch could itself reject if router.replace throws | Catch navigation failure and expose a session error while retaining stale/unmount guards; one new regression check |
| Medium, error contract | Framework 404/405 returned a different JSON shape | Added sanitized HTTPException handler, preserved Allow/CORS/no-store, two new tests |
| Medium, reproducibility | Python requirements allowed ranges with no complete lock | Added hashed Python 3.13 Windows/Linux runtime and test locks constrained to previously installed versions; clean install and pip check passed |
| Medium, deployment gate | HTTPS/domain/proxy configuration, backup restore, recovery policy and hosted CI acceptance not yet established | Explicit production configuration/decision checklist; no deployment performed |
| Low, maintainability | README exceeded 1,100 lines, duplicated setup and stale migration commands; design tables advertised unimplemented fields | Moved historical notes/inventories into milestone-history.md; focused onboarding README, testing/deployment docs; corrected scope/database/wireframe tables |
| Low, hygiene | Local helper and alternate virtualenv exclusions depended on machine-local Git configuration | Added repository ignores for .local-checks, alternate venvs and private key files |

## Security and ownership review

- Authentication: Argon2id hashes; missing-account dummy verification and generic
  invalid-login errors; random 256-bit session tokens stored only as SHA-256
  digests; seven-day expiration, revocation and re-login rotation verified in tests.
- Authorization: require_session resolves the identity; project lookups always
  scope owner_id; issue/comment/label IDs are constrained to the authorized parent.
  Mutations lock the owning project against archival. Submitted ownership/author
  changes are rejected by strict request schemas. No unrestricted ID-only routes
  exist for issues/comments/labels.
- Validation: strict extra-field rejection, bounded strings/enums, database checks,
  foreign keys including cross-project label assignment constraints, parameterized
  filtering before bounded pagination. Project reads are allowed when archived;
  writes require restore. User content renders as React text, not injected HTML.
- CSRF/CORS: every unsafe method requires exactly one configured Origin, including
  auth endpoints. No Host-header inference or permissive Referer fallback. CORS
  permits credentials for one exact frontend origin; errors remain readable with
  no-store. CORS preflight rejection is middleware-level HTTP 400, not an app JSON
  error. Cookies are HttpOnly/host-only/Lax and Secure with production settings.
- Errors/secrets: validation omits input values, unexpected failures return generic
  500 while server diagnostics remain available, SQLAlchemy hides parameters.
  Production log redaction still requires operator acceptance. Tracked-file scan
  found no private .env/key files or high-confidence private-key/GitHub/AWS token
  patterns. This is not a full Git-history or external secret-scanner assessment.
  Ignore rules were verified; only safe .env.example files are tracked.

### Evidence for a second user's isolation

| Resource | Existing tests inspected | Coverage and addition |
| --- | --- | --- |
| Projects | test_projects.test_owner_isolation_and_spoofed_owner; test_project_management.test_filtering_pagination_and_owner_isolation | Owner-filtered active/archived lists, direct detail, edit/archive/restore, spoofed owner, indistinguishable missing/foreign 404 |
| Issues | test_issues.test_parent_and_issue_ownership_and_mismatched_ids; test_filter_dashboard | Foreign list/create/read/update, mismatched own-project IDs, no unscoped route, unchanged owner records; foreign filters/dashboard excluded |
| Comments/labels | test_organization.test_every_write_security_and_archival | Second account denied list/direct reads and all comment/label create/edit/delete and label assignment/removal methods |
| Nested IDs | test_organization.test_cross_project_assignments_and_direct_ids; test_comment_author_enforced | Wrong-parent IDs and non-author writes rejected |
| Additional meaningful gap | test_foreign_ids_under_attackers_own_project_leave_owner_data_unchanged | Foreign comment/label IDs substituted under attacker-owned project/issue; GET/PATCH/DELETE and PUT/DELETE assignments denied; owner data and assignment unchanged after re-login |

No access-control vulnerability was found in these reviewed paths. Existing
session/CSRF/archive tests were retained rather than duplicated.

## Actual verification

| Check | Result |
| --- | --- |
| Local devpilot revision and ORM comparison | 0006_comments_labels, zero differences, before and after review; transaction enforced READ ONLY; no upgrade/downgrade/write |
| Clean source export | 149 repository/proposed source files initially copied into ignored .local-checks/release-clean; later two routing-fix files synced before testing; no .git, private .env, node_modules, .venv or local harness dependencies copied |
| Python dependency install | Fresh Python 3.13.3 virtualenv, hash-checked dev lock installation; pip check passed |
| Frontend install | npm ci from package-lock in the clean copy on Node 22.16.0; no private .env present |
| Empty database setup | Only devpilot_test recreated on isolated loopback port 55432, upgraded from empty to head; zero schema differences |
| Full backend suite | **200 passed, 1 warning in 105.17s**; existing Starlette/httpx deprecation remains; Alembic path_separator warning fixed |
| Post-test migration/schema check | 0006_comments_labels, zero differences; downgrade/preservation tests ran only on disposable database; cluster stopped afterwards |
| Frontend simulations | **105 passed**, zero unhandled rejections: 24 auth, 15 cleanup, 19 issues, 18 board, 15 organization, 14 filtering/dashboard |
| Frontend production build | Passed compilation, TypeScript validation and all nine static pages on Next 15.5.26, in clean copy |
| Final npm audit | Zero vulnerabilities, runtime and development dependency graph included |
| Python audit | No known vulnerabilities in pinned test/runtime dependencies reported by pip-audit 2.10.1; Windows markers applied |
| Linux dependency resolution | uv dry-run resolved hashed lock for x86_64 Linux/Python 3.13, including conditional uvloop; this is resolution, not Linux test execution |
| Workflow static validation | actionlint 1.7.12 passed (official binary checked against published SHA-256); shellcheck unavailable and disabled |
| Actual GitHub Actions run | **Not run**: no commit/push, hosted runner or PostgreSQL service-container execution in this session |
| Browser/staging | Core behavior confirmed by user; no new independent real-browser check during release review |

Clean-copy verification used current tracked files plus the proposed new source
files because no commit was authorized. It did not reuse the original venv or
node_modules. Package download caches were permitted; private configuration and
ignored test helpers were not. Final docs/lock comments do not affect tested code.

## Dependency findings and compatibility

Initial npm audit reported two affected package entries (PostCSS high, Next
moderate via PostCSS), with advisories including
[PostCSS source-map traversal](https://github.com/advisories/GHSA-r28c-9q8g-f849) and
[the incomplete traversal fix](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp).
The latter is fixed from 8.5.23. The selected current 8.5.28 remains within the
PostCSS 8 API line. npm suggested Next 16 as an automatic fix; that major upgrade
was deliberately not taken. App content never accepts user CSS, reducing the
known exposed path, but keeping a vulnerable build dependency was unnecessary.
The override was validated with complete frontend simulations and the actual
CSS Modules/Next production build. Revisit it when updating Next.

Python pins preserve previously working versions rather than taking broad
upgrades. The Linux-only uvloop dependency is explicitly locked. Audit databases
change: today's clean result is not a security guarantee. Initial audit attempts
hit managed-machine TLS trust issues; successful retries used OS trust stores,
not certificate-verification bypasses. CI uses hosted-runner trust. Audit tooling
is isolated from runtime packages. The Starlette/httpx test deprecation is not an
audit vulnerability; migration to its new test transport is separate maintenance.

## Changed-file responsibilities

| Files | Responsibility |
| --- | --- |
| .github/workflows/checks.yml | Pull request/push/manual jobs: isolated PostgreSQL, migrations/schema, backend suite, frontend suite/build and audits; read-only GitHub permission, immutable action refs, no deployment |
| .nvmrc; .python-version | Supported runtime lines shared with CI |
| .gitignore | Portable exclusions for local tooling, alternate venvs and keys |
| backend/requirements.lock; requirements-dev.lock | Complete hashed cross-platform runtime/test dependency resolution |
| backend/scripts/check_schema.py | Expected database, single migration head and read-only ORM schema comparison |
| backend/alembic.ini | Explicit OS path separator, no migration changes |
| backend/app/main.py; tests/test_http_errors.py | Consistent sanitized routing error envelope and regression coverage |
| backend/tests/test_organization.py | Additional cross-account nested-ID substitution coverage |
| frontend/package.json; package-lock.json | Portable test command, pinned jsdom, supported Node engine and patched PostCSS override |
| frontend/tests/run.cjs; auth-session-check.cjs; use-api-check.cjs; issues-check.cjs | Portable regression harnesses and process-isolated runner; new navigation failure check |
| frontend/tests/board-check.cjs; organization-check.cjs; filter-dashboard-check.cjs | Resolve jsdom from tracked package dependencies |
| frontend/lib/useApi.ts | Handle failed expired-session navigation without unhandled rejection; preserve stale-result protection |
| README.md; docs/milestone-history.md | Focused onboarding with archived historical evidence and corrected links |
| docs/testing.md; deployment.md; release-readiness.md | Repeatable commands, production contract, findings and actual evidence |
| docs/prd.md; architecture.md; database.md; api.md; wireframes.md; roadmap.md | Resolve stale scope/field claims and link current release status |

## Remaining release gates

Run the workflow on GitHub after the user chooses to commit/push; require both job
checks in branch protection. Perform the staging/edge/backup/abuse-control checks
in [deployment.md](deployment.md), plus production Chrome/Edge and keyboard/mobile
acceptance. Set an owner for dependency monitoring and rate-limit/recovery policy.
No deployment, commit or push was performed. Exact shell/directory-labeled local
commands are in [README](../README.md) and [testing](testing.md).

## Authentication rate-limit milestone

The previous hosted Actions and local browser checks were subsequently confirmed
by the user. This milestone has not been pushed or run on hosted Actions.

Implemented shared PostgreSQL IP budgets for login/registration and an additional
normalized-email login budget, before password work. Atomic UPSERTs commit before
authentication; errors and successful requests count, blocked retries never extend
windows, and missing storage fails closed. Explicit proxy trust replaces arbitrary
forwarded-header use. CORS exposes Retry-After and 429 uses the public error format.
Frontend login/register alerts preserve drafts and require manual retry. No runtime
dependencies or per-process limiter were added.

**Actual checks:** full guarded PostgreSQL suite **240 passed, 1 existing warning
in 79.23s** (40 new limiter cases); **113 frontend simulations passed**, zero
unhandled rejections; production build and TypeScript validation passed. Tests
cover thresholds, clock-controlled expiry without sleeps, concurrent HTTP login
IP/email and registration attempts, independent clients/pools, normalization and
unknown users, trusted/untrusted chains, malformed proxy values, unavailable
storage, session preservation, bounded/locked cleanup and backlog reporting.
Isolated migration downgrade/upgrade preserves all seven existing application
tables; post-test schema check reports 0007_auth_rate_limits and zero differences.
The test PostgreSQL cluster is stopped after verification.

After explicit approval on 2026-09-30, read-only checks confirmed **devpilot at
0006_comments_labels** before upgrading to **0007_auth_rate_limits**. Subsequent
read-only verification reported zero schema differences, confirming the counter
table, constraint and expiry index. No development downgrade or other database
change was performed. [SQL, effects and exact commands](auth-rate-limits.md).

Changed-file responsibilities:

| Files | Responsibility |
| --- | --- |
| backend/app/config.py; backend/.env.example | Validated limits/windows, shared HMAC secret, explicit proxy allowlist |
| backend/app/client_ip.py | Untouched peer resolution and bounded trusted X-Forwarded-For chain handling |
| backend/app/services/rate_limits.py | Atomic committed budgets, expiry, bounded cleanup, fail-closed storage handling |
| backend/app/models.py; backend/alembic/versions/0007_auth_rate_limits.py | Counter model/table/index/check, preserving existing schema and data |
| backend/app/routes/auth.py; main.py; security.py | Pre-password enforcement, sanitized 429/503, Retry-After exposure with existing CORS/CSRF/cookies |
| backend/scripts/prune_rate_limits.py | Target-checked bounded expiry maintenance and backlog exit status |
| backend/tests/conftest.py; test_rate_limits.py | Isolated counters/configuration and deterministic PostgreSQL/HTTP/migration coverage |
| frontend/lib/api.ts; components/AuthForm.tsx; tests/auth-session-check.cjs | Retry header parsing, accessible draft-preserving guidance, eight new form simulations |
| README.md; docs/auth-rate-limits.md; api.md; deployment.md; database.md; architecture.md; roadmap.md; release-readiness.md; testing.md | Contracts, proxy assumptions, retention schedule, migration gate, evidence and commands |

Remaining limitations/gates: approve local migration; configure a shared random
production key; launch with --no-proxy-headers; select narrow trusted proxies;
schedule and monitor one-minute expiry cleanup. Ingress body/concurrency/DDoS
controls and recovery decisions remain. NAT users share quotas; IP rotation and
sustained targeted temporary email denial are possible. No account is permanently
locked. Verify the real proxy, multi-worker restart and idle cleanup behavior on
staging, and exercise the 429 UI in Chrome/Edge after migration. HTTP/jsdom checks
are not real browser or deployed reverse-proxy verification. No deploy/commit/push.
