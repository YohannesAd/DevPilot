# Authentication rate limits

## Decision and API behavior

Reuse PostgreSQL rather than adding Redis, a paid service or per-process counters.
Login and registration count schema-valid, CSRF-approved POST attempts **before**
password hashing/verification or account lookup. Successful requests, incorrect
passwords, unknown email addresses, and duplicate registrations consume attempts.
Malformed JSON/schema errors (422), rejected Origins (403), preflight, session GET
and logout do not. Ingress must still bound request body size and concurrency.

| Scope | Default | Environment configuration |
| --- | --- | --- |
| Login: exact client IP | 30 / 600 seconds | AUTH_LOGIN_IP_LIMIT, AUTH_LOGIN_IP_WINDOW_SECONDS |
| Login: normalized submitted email across all IPs | 10 / 900 seconds | AUTH_LOGIN_EMAIL_LIMIT, AUTH_LOGIN_EMAIL_WINDOW_SECONDS |
| Registration: exact client IP | 5 / 3600 seconds | AUTH_REGISTER_IP_LIMIT, AUTH_REGISTER_IP_WINDOW_SECONDS |

Limits accept 1-1,000,000 and windows accept 1-86,400 seconds. Invalid values fail
configuration validation. There is no disable flag or storage-failure bypass.
All workers must use identical settings and AUTH_RATE_KEY_SECRET. Restart workers
to change cached configuration; normal restarts do not reset counters. A key
rotation changes the counter namespace, resetting effective budgets; coordinate
rotation and keep cleanup running for the old expiring keys.

Email identity is the validated Pydantic EmailStr value, normalized to Unicode NFC,
trimmed and lowercased, consistent with case-insensitive login. Do not strip plus
tags, dots, or infer mailbox-provider aliases. There is no account lookup for the
limiter: known and unknown emails have the same thresholds, 429 response and
recovery behavior. Incorrect credentials retain the existing generic 401.

The IP quota is consumed first. If rejected, no email bucket is created/charged;
an existing blocked email bucket is read only to return the longer retry delay.
Otherwise, the email quota is consumed too. Each scope has a fixed window starting
at its first counted attempt. Counters saturate at limit+1, and blocked requests
do not extend expiry. The next attempt at/after expiry starts a new window.

A blocked request returns HTTP 429:

```json
{"error":{"code":"rate_limited","message":"Too many attempts. Wait before trying again."}}
```

Retry-After contains positive, rounded-up seconds until applicable current limits
expire. It is exposed through credentialed CORS, with Cache-Control: no-store.
No submitted email/password, client IP, bucket identity or account-existence flag
is returned. No session cookie is set, cleared or rotated on rejection. New
attempts by other clients can consume quota during the wait; guidance is not a
reservation. The form focuses its existing alert, shows the wait, retains inputs,
and never automatically retries. Users may submit manually after waiting.

Unavailable/timeout/missing limiter storage returns 503 auth_unavailable with
Retry-After: 60 and no password work. Database diagnostics are not returned; the
server emits a generic storage-unavailable log message. Lock waits are capped at
2 seconds and SQL statements at 3 seconds during the limiter transaction. These
SET LOCAL settings end when counters commit, before the authentication transaction.

## Atomicity, workers and retention

PostgreSQL [INSERT ON CONFLICT DO UPDATE](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
atomically creates/increments/resets each
key. A short transaction consumes the IP and, if eligible, email budget; it commits
before authentication. Rejected credentials and subsequent request failures do not
roll counters back. Separate workers and connection pools share the same rows;
no worker-local memory or browser state decides permission. Database clock time
provides expiry; client clocks and forwarded timestamps are never consulted.

Keys are HMAC-SHA256 over a scope plus normalized identity. No raw email, IP or
password is stored in this table. Production requires AUTH_RATE_KEY_SECRET from a
secret store (generate at least 32 random bytes, encoded as hex/base64); the value
must be shared across workers and protected from logs. A stable public development
key is used only when APP_ENV=development and the variable is blank. HMAC keys are
pseudonymous, not an assurance that identities are anonymous if the secret leaks.

Logical validity is bounded to at most one configured window (maximum one day).
Each eligible attempt opportunistically deletes at most 100 expired rows using
an expiry index and FOR UPDATE SKIP LOCKED. This avoids an unbounded cleanup scan
per request, but **idle databases do not clean themselves**. Production must
schedule the cleanup command below at least once per minute, monitor failures and
exit status 1 (remaining expired backlog), and rerun/increase bounded batches until
clear. The default job deletes at most 100 batches of 100 rows. With a healthy
scheduler and no backlog, physical deletion occurs within one minute after expiry;
this bound depends on the scheduler actually running. PostgreSQL backups retain
historical rows according to the separate backup-retention policy.

## Client-IP and trusted proxy contract

For Vercel/Render staging, use the authenticated proxy integration in
[staging.md](staging.md): Vercel's edge-derived IP is relayed with a shared server
secret and validated by Render. It takes precedence over network-peer resolution.
Keep AUTH_TRUSTED_PROXY_CIDRS empty there; production requires API_PROXY_SECRET.
The CIDR rules below describe direct/local deployments without that integration.

Start Uvicorn with **--no-proxy-headers**. Do not wrap the app with another component
that rewrites ASGI scope.client from arbitrary forwarded headers. The application
requires the untouched network peer; a hosting platform that rewrites it needs an
explicitly reviewed integration. Uvicorn's default forwarding behavior is not this
application's trust policy. FRONTEND_ORIGIN/API_ORIGIN are CSRF/CORS settings and
never imply that a client IP or proxy is trusted.

AUTH_TRUSTED_PROXY_CIDRS defaults to empty. For an untrusted direct peer, all
X-Forwarded-For, Forwarded and X-Real-IP headers are ignored. For an allowlisted
peer, exactly one X-Forwarded-For header containing at most 20 literal IPs and
2,048 characters is accepted. Starting at the direct peer, walk right-to-left,
discarding only allowlisted proxy hops, and stop at the first untrusted IP. Values
to its left cannot override it. If every hop is trusted, use the leftmost IP.
Absent, malformed, duplicate or oversized headers fall back to the actual peer.
Forwarded and X-Real-IP are never used. Unknown/non-IP ASGI peers share an unknown
bucket rather than bypassing limits. IPv4-mapped IPv6 normalizes to IPv4; other
IPv6 addresses are limited individually. Scoped/zone IP strings are rejected.

Configure only exact controlled proxy IPs or narrowly justified network ranges,
never wildcard/default-route trust. The proxy must overwrite incoming client
X-Forwarded-For or correctly append the observed peer, and direct API access should
be network-restricted to it. Example chain: trusted 127.0.0.1 peer and header
"192.0.2.99, 198.51.100.7" resolves to 198.51.100.7, not the forged left value.
Testing a real deployment's proxy forwarding remains mandatory.

## Tradeoffs

Shared NAT users share IP quotas. A botnet or IPv6 rotation can evade the IP scope;
the global email scope reduces distributed guessing but permits temporary targeted
login denial. Fixed windows can permit bursts near a window boundary. No account
is permanently disabled and windows never extend on
blocked retries, but sustained abuse can spend each new window. No CAPTCHA,
progressive permanent lockout, password reset, or paid service was added.
PostgreSQL writes add load and DB availability becomes a prerequisite for new
login/registration. Existing session reads/logout are not newly rate-limited.
Keep ingress connection/body limits, monitoring and account recovery decisions.

## Migration review: 0007_auth_rate_limits (applied locally)

The new migration follows 0006 and creates only:

```sql
CREATE TABLE auth_rate_limits (
    key VARCHAR(64) PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_auth_rate_limits_attempts CHECK (attempts BETWEEN 1 AND 1000001)
);
CREATE INDEX ix_auth_rate_limits_expires ON auth_rate_limits (expires_at);
```

Upgrade also advances Alembic's revision. Existing users, sessions, projects,
issues, comments, labels and assignments are preserved; there are no new foreign
keys to account data. Downgrade drops only the index/table and its counters,
resetting rate-limit history. New application code needs the table; rollbacks
require coordinating the application and migration. No development downgrade
was run or is requested. See the [migration source](../backend/alembic/versions/0007_auth_rate_limits.py).

After explicit approval on 2026-09-30, the target database was confirmed as
devpilot at 0006_comments_labels using read-only queries, then upgraded to
0007_auth_rate_limits. Read-only schema verification confirmed the new table,
index and constraints with zero ORM schema differences. No development downgrade
or other database change was performed. Automated upgrade/downgrade/preservation
testing remains confined to guarded devpilot_test.

## Commands

`<repo>` means C:\Users\yohan_0namuao\Downloads\DevPilot-starter. No command below
is permission to apply a migration without the requested approval.

**PowerShell; starting directory: `<repo>\backend` (offline migration review only):**

```powershell
& ..\.venv\Scripts\python.exe -m alembic upgrade 0006_comments_labels:0007_auth_rate_limits --sql
```

**PowerShell; starting directory: `<repo>\backend` (only after explicit local migration approval):**

```powershell
& ..\.venv\Scripts\python.exe -m alembic upgrade 0007_auth_rate_limits
& ..\.venv\Scripts\python.exe -m scripts.check_schema --database devpilot
```

Verify the configured target is devpilot before applying. This milestone has not
run these upgrade commands against that database.

**PowerShell; starting directory: `<repo>\backend` (after approved migration, local server):**

```powershell
& ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --no-proxy-headers
```

**PowerShell; starting directory: `<repo>\backend` (after migration, schedule every minute):**

```powershell
& ..\.venv\Scripts\python.exe -m scripts.prune_rate_limits --database devpilot
```

This maintenance command mutates only expired rate-limit rows and validates the
configured/actual database name. In production, schedule the equivalent interpreter
command for the actual dedicated database and monitor its exit status; do not use
--reload for the production API. All replicas need the same secret/settings.

**PowerShell; starting directory: `<repo>\backend` (already running isolated test cluster on 55432):**

```powershell
$env:TEST_DATABASE_URL = 'postgresql+psycopg://devpilot_test_admin@127.0.0.1:55432/devpilot_test'
& ..\.venv\Scripts\python.exe -m pytest tests -q
Remove-Item Env:TEST_DATABASE_URL
```

See [testing](testing.md) to start/stop the isolated cluster; never point automated
tests at devpilot. Tests raise unrelated-feature thresholds explicitly; new limiter
tests use small thresholds and a deterministic database clock, not long sleeps.

**PowerShell; starting directory: `<repo>\frontend` (stop dev server before build):**

```powershell
npm.cmd test
npm.cmd run build
```

Frontend checks are jsdom/HTTP simulations, not real browser proxy or cookie tests.
After approved migration, verify the 429 message and retry in Chrome/Edge against
staging HTTPS, a shared NAT, the actual trusted proxy chain and a second API worker.
Verify restarting a worker preserves limits, and observe scheduled deletion after
an idle window. No deployment/commit/push is performed by these instructions.
