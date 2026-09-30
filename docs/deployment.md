# Production configuration and release decisions

DevPilot is ready for staging verification after CI passes, not an automatically
approved public deployment. Core features were confirmed in the user's browser;
production infrastructure and browser security behavior need separate acceptance.

## Configuration contract

| Component / variable | Required production value |
| --- | --- |
| Backend APP_ENV | production; enables Secure cookies and validates HTTPS origins |
| Backend DATABASE_URL | Dedicated PostgreSQL connection from the host's secret store; TLS with server verification appropriate to the provider |
| Backend FRONTEND_ORIGIN | Exact public HTTPS origin; no path, wildcard, query or trailing slash |
| Backend API_ORIGIN | Exact public HTTPS API origin; trusted Origin for API-hosted interactions |
| Frontend NEXT_PUBLIC_API_URL | Public API origin supplied **at build time**, without trailing slash; public configuration, never credentials |

Choose either one HTTPS origin with a proxy forwarding /api to FastAPI, or HTTPS
subdomains of the same site (for example app.example.com and api.example.com).
SameSite=Lax cookies do not support unrelated cross-site frontend/API domains.
The session cookie is host-only, HttpOnly, Secure in production, Path=/, with a
seven-day fixed lifetime. Database revocation/expiration is checked on each
request. Do not weaken SameSite or CORS to compensate for an incompatible host.
All unsafe API requests require exactly one allowlisted Origin, including login
and registration. The proxy must preserve Origin and must not cache private API
responses or Set-Cookie. Only trust forwarded headers from the controlled proxy.

Use Python 3.13, Node 22.13+ within 22.x, PostgreSQL 18 and the committed locks.
The runtime Python lock excludes pytest/httpx. Build the frontend with the final
public API URL; a changed API URL requires rebuilding. Run Next production start
and Uvicorn without --reload under the chosen process supervisor. No hosts,
process counts, proxy trust IPs or migration credentials have been selected here.

## Decisions required before public exposure

1. **Abuse controls:** PostgreSQL-backed login/registration limits are now
   implemented; deploy only after the reviewed 0007 migration and configure the
   shared HMAC key, trusted proxies and scheduled expiry cleanup described in
   [authentication limits](auth-rate-limits.md). Validate thresholds with real
   traffic. Ingress request body/concurrency/time limits and broader DDoS protection
   are still required: the limiter intentionally runs after CSRF/body validation.
   IP rotation and targeted temporary email denial remain possible.
2. **Recovery and account policy:** password reset, email verification and account
   deletion are not implemented. Decide whether this is a controlled pilot and
   define operator-assisted recovery; do not promise verified mailbox ownership.
   Registration's explicit duplicate-email 409 can reveal account existence.
3. **Database operations:** choose provider/region, least-privilege runtime role,
   separate migration role, encrypted backups, retention and a demonstrated
   restore. Only a controlled release job may run reviewed migrations. Take a
   backup before a schema change; rolling app back is not permission to downgrade
   data. No automatic migration runs at API startup. Decide session-row cleanup.
4. **Edge and hosting:** HTTPS certificates, domain ownership, proxy routing,
   trusted forwarding, request limits and security headers (HSTS after HTTPS is
   verified; CSP must be tested with Next) are deployment responsibilities.
   Decide whether public /docs and /openapi.json should be exposed. Keep PostgreSQL
   private and avoid sharing CI superuser privileges with the runtime.
5. **Operations:** select logging/error monitoring, redact passwords, cookies,
   authorization headers and database URLs, set availability alerts and a rollback
   owner. /api/health is process liveness only; define database readiness monitoring.
6. **GitHub:** enable Actions and protect the release branch with both V1 check
   jobs required. Confirm fork PR policy, secret scanning/push protection where
   available, dependency alert ownership, and audit-failure response. The workflow
   runs unprivileged pull_request/push events, never pull_request_target, requests
   contents:read, does not persist checkout credentials, and does not deploy.

## Production acceptance still required

On staging HTTPS domains, verify login/register/logout/re-login and refresh,
Secure/HttpOnly/SameSite=Lax cookie attributes, exact credentialed CORS, denied
foreign/missing Origins, archived write restrictions and a second account's access.
Exercise Chrome and Edge, desktop/mobile, keyboard controls and native dialogs.
Test URL filter Back/Forward, failure/retry, no cleanup overlays and dashboard
archive exclusions. Test an expired session and API outage through the real proxy.
Complete the backup restore, rate-limit, log-redaction and app rollback drills.
Never describe mocked DOM/API checks as this staging verification.
