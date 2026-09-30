# Vercel Hobby / Render Free / Neon Free staging

Preparation only: no cloud resources, remote migrations, local data copies or
deployments were performed. Use a separate **devpilot_staging** database. Code and
local schema are at **0007_auth_rate_limits**; this milestone needs no migration.

## Architecture and trust

Browser -> Vercel Next.js `/api/...` -> Render FastAPI -> Neon.
The browser uses relative URLs. NEXT_PUBLIC_API_URL is obsolete and ignored.
The small Node route handler is necessary instead of a plain rewrite to replace
client-IP headers and authenticate to Render. No dependency was added.

It forwards method, query string, body, Cookie, Origin, Content-Type and Accept;
preserves status, separate Set-Cookie headers, Retry-After and Allow; and forces
browser/CDN/Vercel caches to no-store. The route is dynamic and upstream fetch is
uncached. Redirects are deliberately rejected as 502 rather than followed with
credentials. Bodies are capped at 128 KiB, above current text-field limits.

Relayed host-only cookies belong to the **frontend** domain, retain Path=/,
HttpOnly, SameSite=Lax and production Secure, and are deleted through the same
proxy. Original Origin is preserved, not invented from Host. Existing exact-origin
CSRF, sessions and ownership remain enforced. Use one stable staging frontend URL;
preview domains are not implicitly allowed.

Vercel documents that its edge overwrites X-Forwarded-For with the connecting
client IP. The handler requires VERCEL=1 and one literal IP, rejecting missing,
malformed, zoned or comma-separated values. Do not put another CDN/proxy in front
of Vercel without a new trust review: its address could replace the user identity.
[Vercel request headers](https://vercel.com/docs/headers/request-headers).

The handler replaces caller-provided X-DevPilot-Proxy-Secret/X-DevPilot-Client-IP.
Render accepts the IP only after a constant-time secret comparison and validation;
rate limiting uses that verified identity. Render peer addresses/XFF chains are
irrelevant in this mode. Leave AUTH_TRUSTED_PROXY_CIDRS empty; run Uvicorn with
--no-proxy-headers. This avoids guessed provider CIDRs and shared-proxy IP buckets.

Direct Render application requests without proxy credentials return 403, including
/docs and /openapi.json. GET /api/health is public liveness only (HEAD is exempt
from the gate but may return 405). CORS preflight can be answered without granting
application access. The token is application access control, not a network firewall
or DDoS defense. Never expose it in browser code or logs; rotate both services
together. **Actual edge overwrite behavior and distinct real-client buckets are
staging checks.** If those fail, block release rather than trust arbitrary headers.

## 1. Neon: an empty staging database

Create a separate Free project/branch and empty `devpilot_staging`. Select
PostgreSQL 18 to match CI, near the application region. If unavailable, validate
the offered version in isolated CI first. Use a dedicated migration owner and a
least-privilege runtime role. After migration, grant runtime schema USAGE and
SELECT/INSERT/UPDATE/DELETE on application tables, plus sequence USAGE/SELECT where
needed; apply appropriate default privileges. Do not grant runtime schema creation.

Use a **direct/unpooled** Neon hostname for this single Render process. The current
SQLAlchemy pool is bounded at 5 plus 10 overflow with pre-ping; budget those
connections alongside maintenance jobs. This avoids changing the existing session
timezone setting for transaction pooling. Review pooling before adding workers.

SQLAlchemy URL: `postgresql+psycopg://.../devpilot_staging?sslmode=verify-full&sslrootcert=system&connect_timeout=10`.
URL-encode credentials; use the provider hostname, not an IP. Verify the host's CA
trust against Neon; never weaken TLS to resolve a failure. Native pg tools need
`postgresql://` or libpq services, without `+psycopg`. Use direct endpoints for
backup/restore too. [Neon TLS guidance](https://neon.com/blog/avoid-mitm-attacks-with-psql-postgres-16).

## 2. Render: manual deployment configuration

Root Directory: **backend**. Python web service, **Free**, Python **3.13.3** (the
verified local release patch; CI supports 3.13). Health path: **/api/health**.
The optional root render.yaml encodes these settings. Importing a Blueprint creates
resources only with operator action; disable Blueprint Auto Sync and service
auto-deploys. No migrations run at build or startup.

**Bash, Render build shell; starting directory: repository backend:**

```bash
python -m pip install --require-hashes -r requirements.lock
```

**Bash, Render runtime shell; starting directory: repository backend:**

```bash
python -m scripts.check_config && python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --no-proxy-headers
```

| Private Render variable | Value |
| --- | --- |
| APP_ENV | production, including staging; enables Secure cookies |
| DATABASE_URL | Direct Neon runtime-role URL with verified TLS |
| FRONTEND_ORIGIN | Exact stable https://staging-frontend.vercel.app; no trailing slash |
| API_ORIGIN | Exact https://staging-api.onrender.com; no trailing slash |
| API_PROXY_SECRET | Random 32 bytes encoded as 64 hex characters; same on Vercel |
| AUTH_RATE_KEY_SECRET | Separate random secret, at least 32 bytes |
| AUTH_TRUSTED_PROXY_CIDRS | Empty |
| PYTHON_VERSION | 3.13.3 |

Generate/store secrets privately with a password manager or secret store; never
print them in commands, logs or public variables. Keep login IP 30/600s, email
10/900s, registration IP 5/3600s; optional overrides are in backend/.env.example.
Health is liveness only, not database readiness.

## 3. Reviewed migrations: operator step, not executed remotely

Use the locked local virtualenv. Securely inject STAGING_DATABASE_URL as the
direct **migration-owner** URL, verify its Neon project/host privately, and review
migrations 0001–0007. Back up any existing staging data before an upgrade.

**PowerShell; starting directory: `<repo>\backend`:**

```powershell
$env:DATABASE_URL = $env:STAGING_DATABASE_URL
if (-not $env:DATABASE_URL) { throw 'Inject STAGING_DATABASE_URL privately first.' }
@'
from sqlalchemy import create_engine, text
from app.config import get_database_url
url = get_database_url()
assert url.database == 'devpilot_staging' and url.host.endswith('.neon.tech')
assert '-pooler' not in url.host and url.query.get('sslmode') == 'verify-full'
with create_engine(url, hide_parameters=True).connect() as db:
    db.execute(text('SET TRANSACTION READ ONLY'))
    assert db.scalar(text('select current_database()')) == 'devpilot_staging'
    exists = db.scalar(text("select to_regclass('public.alembic_version') is not null"))
    print('Target: devpilot_staging; revision:', db.scalar(text('select version_num from alembic_version')) if exists else 'empty')
'@ | & ..\.venv\Scripts\python.exe -
if ($LASTEXITCODE -ne 0) { throw 'Target verification failed.' }
# Only after migration review and approval:
& ..\.venv\Scripts\python.exe -m alembic upgrade 0007_auth_rate_limits
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; do not deploy.' }
& ..\.venv\Scripts\python.exe -m scripts.check_schema --database devpilot_staging
if ($LASTEXITCODE -ne 0) { throw 'Schema verification failed; do not deploy.' }
Remove-Item Env:DATABASE_URL
```

This creates accounts, sessions, projects, archival, issues, comments/labels and
rate counters from migrations, not copied local records. Close the credentialed
terminal afterward. Migration ownership and runtime grants are separate tasks.

## 4. Vercel: frontend configuration

Framework Next.js; Root Directory **frontend**; Node **22.x**; default Next output.
Install: `npm ci`; build: `npm run build`. Both commands use **Bash, provider build
shell; starting directory: repository frontend**. Committed package-lock remains
unchanged. Select one stable project domain and configure build/runtime variables:

| Server-only Vercel variable | Value |
| --- | --- |
| API_PROXY_MODE | vercel |
| API_BACKEND_ORIGIN | Exact Render HTTPS origin; no credentials, path or query |
| API_PROXY_SECRET | Same 64-hex secret as Render; mark sensitive |
| VERCEL | Platform supplies 1; do not fake this on other hosting |

Remove NEXT_PUBLIC_API_URL. Do not give Vercel database credentials or the rate-key
secret. Do not grant untrusted previews the proxy secret. Unconfigured previews
fail closed; a preview needs its own isolated backend/data and explicitly matching
Origin. next.config.ts validates configuration at build/start; the handler validates
at runtime too. Redeploy after environment changes. Deploy manually after migration
and backend validation. GitHub Actions remains checks-only, with no deployment job.

## 5. Cold starts, maintenance and free limits

Render Free sleeps after 15 idle minutes and can take about a minute to wake.
Neon idle compute may also suspend. The proxy uses a 20-second upstream timeout
inside a 30-second function budget. Timeout/network errors become handled 503s.
Wait a minute and retry manually: mutations are never automatically replayed.
A timeout can occur after a write committed; inspect saved data first. After
registration uncertainty, try signing in before registering again. Auth drafts
remain in the form, not persistent browser storage.
[Render Free constraints](https://render.com/docs/free),
[Vercel function limits](https://vercel.com/docs/functions/limitations).

Free quotas, ephemeral Render disk and suspension make this controlled staging,
not guaranteed availability. Check current Neon compute/storage/restore allowances
in its dashboard; limited restore history does not replace backups. Hobby is for
personal non-commercial use: confirm eligibility. [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Rate-counter physical cleanup still needs the bounded command in
[authentication limits](auth-rate-limits.md). Choose an external trusted scheduler
or operator machine to run it at least every minute and monitor failures/backlog.
Render Free does not provide an always-running worker in this setup. Frequent DB
cleanup prevents idle suspension and consumes Neon compute: budget that tradeoff.
**No scheduler is provisioned; it remains a release gate.** Do not claim an idle
retention guarantee or use browser keep-alive traffic to mask it.

**Bash, external worker with private DATABASE_URL; starting directory: repository backend:**

```bash
python -m scripts.prune_rate_limits --database devpilot_staging
```

## 6. Backup and disposable restore

Use PostgreSQL 18 tools. Privately configure libpq services `devpilot_staging_backup`
and `devpilot_restore_check` with direct hosts, databases/roles, verified TLS and
protected pgpass/secret tooling. Never commit service/password files or archives.
Create a **new empty devpilot_restore_check** database with a separate role. Never
point the running staging app at it. Archives contain private data and sessions:
encrypt, restrict access, assign retention/deletion ownership, and test restoration.

**PowerShell with PostgreSQL 18 tools on PATH; starting directory: `<repo>`:**

```powershell
New-Item -ItemType Directory -Force .local-checks/backups | Out-Null
$backupDb = & psql 'service=devpilot_staging_backup' -X -Atc 'select current_database()'
if ($LASTEXITCODE -ne 0 -or $backupDb -ne 'devpilot_staging') { throw 'Wrong backup source.' }
$archive = Join-Path $PWD ('.local-checks/backups/staging-' + (Get-Date -Format yyyyMMdd-HHmmss) + '.dump')
& pg_dump --dbname='service=devpilot_staging_backup' --format=custom --no-owner --no-acl --file=$archive
if ($LASTEXITCODE -ne 0) { throw 'Backup failed.' }
$restoreDb = & psql 'service=devpilot_restore_check' -X -Atc 'select current_database()'
if ($LASTEXITCODE -ne 0 -or $restoreDb -ne 'devpilot_restore_check') { throw 'Wrong restore target.' }
$tables = & psql 'service=devpilot_restore_check' -X -Atc "select count(*) from pg_tables where schemaname='public'"
if ($LASTEXITCODE -ne 0 -or $tables -ne '0') { throw 'Restore target must be empty.' }
& pg_restore --dbname='service=devpilot_restore_check' --exit-on-error --single-transaction --no-owner --no-acl $archive
if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }
& psql 'service=devpilot_restore_check' -X -Atc 'select version_num from alembic_version'
```

**PowerShell; starting directory: `<repo>\backend`:**

```powershell
$env:DATABASE_URL = $env:RESTORE_DATABASE_URL
if (-not $env:DATABASE_URL) { throw 'Inject RESTORE_DATABASE_URL privately first.' }
& ..\.venv\Scripts\python.exe -m scripts.check_schema --database devpilot_restore_check
Remove-Item Env:DATABASE_URL
```

Compare row counts and selected test records privately, test a disposable login
using an isolated app, and reapply intended runtime grants (--no-acl omits them).
Record success before deleting the disposable target through Neon. Never use
--clean against staging/local. Keep an encrypted pre-migration backup.

## 7. Rollback and unresolved policy

Record paired frontend/backend deployment IDs and schema revision. Restrict writes
on a faulty release; check for committed requests before restoring both compatible
app releases. Keep the schema if compatible: app rollback never authorizes a data
downgrade. A pre-proxy backend removes the direct-access gate; never roll back to
it while exposing Render. For incompatible changes, restore into a new database,
verify it, reconcile writes since backup, then explicitly approve switching both
services. Retain the original database for recovery. No automated downgrade.

Password reset, email verification and account deletion are absent. Account
recovery is an unresolved release decision: keep a controlled pilot and define
operator identity verification before wider access. Do not promise recovery or
verified mailbox ownership. Assign backup, monitoring, key rotation, ingress abuse
protection, rate/session cleanup and dependency-maintenance owners.

## Real staging acceptance: still required

- Chrome/Edge HTTPS register/login/refresh/logout/re-login; frontend-only cookie
  with Secure/HttpOnly/Lax, correct deletion and no third-party cookie dependence.
- Browser requests stay on /api; actual method/query/body/status/Retry-After survive
  both edges. No cached private responses or cross-account reuse.
- Missing/foreign Origin mutations fail; direct Render requests with missing/wrong
  token fail. Health works. Never expose tokens in screenshots or logs.
- Two real client networks have independent quotas; spoofed XFF/custom-IP headers
  cannot select buckets. Verify all 429 thresholds, retained drafts and expiry.
- Ownership, archived writes, List/Board/filter links and persisted refresh work.
- Let Render sleep; verify cold-start guidance/manual retry and no stale cleanup
  errors. Check mutation state before repeating an uncertain operation.
- Verify Neon TLS/connections, remote migration/schema, cleanup schedule, quotas,
  encrypted backup/disposable restore, paired rollback and log redaction.
