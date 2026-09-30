# DevPilot

DevPilot is a workspace for individual developers to organize projects and track bugs, features, and tasks. V1 covers accounts, projects, issues, labels, comments, a Kanban board, and a basic dashboard. GitHub integration and AI are later phases.

## Current implementation

This repository began with a small vertical slice: a FastAPI health endpoint and a Next.js page that fetches it. Accounts, persistent sessions, private project management and core issues are implemented. Owners can create, list, view, edit and change issue status inside projects. Local migration `0004_project_archival` is applied. `0005_create_issues` is also approved, applied, and verified on local `devpilot`. The project Kanban board is implemented. Comments and project labels are now implemented in code. Migration `0006_comments_labels` is approved, applied, and verified on local devpilot. Project issue filtering and a real-data dashboard are also implemented; see the latest handoff at the end of this README. Assignment, issue archival/deletion, GitHub and AI remain deferred.

For the existing Windows setup, use the terminal/directory-labeled commands in
**Comments and labels: migration review and handoff** below. Migration 0006 has already been approved and applied locally. Migration 0005 is already
applied locally. Historical setup sections remain reference material for new installations.

## Open in VS Code

Open the local `DevPilot-starter` folder (GitHub repository: `DevPilot`) using **File → Open Folder**. Run the backend and frontend in separate VS Code terminals.

### Backend (new setup)

Existing Windows setup: use the root `.venv` and the Git Bash commands under
"Review and apply the sessions migration" below. Do not overwrite `backend/.env`.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate             # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env                 # Windows PowerShell: Copy-Item .env.example .env
# Configure PostgreSQL and DATABASE_URL as described below, then:
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/docs and http://localhost:8000/api/health.

### Local PostgreSQL setup and first migration

The current Windows development machine already has PostgreSQL 18.6 running on
port `5432`, the login role `devpilot_app` with its password set interactively,
and the database `devpilot` owned by `devpilot_app`. Connecting in SQL Shell (psql)
and running `SELECT current_database(), current_user;` confirmed `devpilot` and
`devpilot_app`. **Do not create this role or database again on this machine.**
Alembic revision `0001_create_users` has been applied and verified in this local
database. Login uses the additive `0002_create_sessions` migration. The Projects milestone
added `0003_create_projects`, which is applied to your local devpilot database.
A read-only check during the issues milestone confirmed `0004_project_archival`.
It was approved and applied previously. After explicit user approval,
`0005_create_issues` was applied to local devpilot. Alembic reports 0005 (head)
and no schema drift; all four existing project records were preserved.

Other developers setting up a **new computer** must install and start PostgreSQL
and create their own local role and database. Only on a new setup, connect as a
local PostgreSQL administrator (for example, `psql -U postgres -d postgres`) and
use the following names to match `.env.example`:

```sql
CREATE ROLE devpilot_app LOGIN;
\password devpilot_app
CREATE DATABASE devpilot OWNER devpilot_app;
```

The `\password` prompt keeps the real password out of SQL command history. For
the existing Windows setup, use the password already set for `devpilot_app`.
Edit `backend/.env` locally and replace `REPLACE_WITH_LOCAL_PASSWORD` in
`DATABASE_URL` with that password. The example connects to `127.0.0.1:5432`,
database `devpilot`, as `devpilot_app`. Never paste the real password into chat
or put it in tracked source files. URL-encode special characters in credentials
(for example, `@` becomes
`%40`). `.env` files are ignored by Git; commit only the safe `.env.example`.
An existing `DATABASE_URL` environment variable takes precedence over `.env`.
Use a local development database for these instructions.

For a new database, after reviewing the configuration and migrations, run from
`backend`, with its virtual environment active:

```bash
alembic upgrade head
alembic current
alembic check
```

After upgrading a new database to head, the revision should be `0005_create_issues`, and `alembic check`
should report no new upgrade operations. Migrations are explicit; starting the
API never creates or modifies tables. The health route does not query the database.

After applying the migration, connect using
`psql -h 127.0.0.1 -p 5432 -U devpilot_app -d devpilot -W` (enter the password at
the prompt), then inspect the migration, columns, and indexes. On Windows, you
can also use SQL Shell (psql) with those same host, port, database, and user values:

```sql
SELECT version_num FROM alembic_version;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'users';
```

Expect six required columns: `id` (UUID), `email`, `password_hash`, `display_name`,
`created_at`, and `updated_at`; a primary key; and the unique
`uq_users_email_lower` index on `lower(email)`. Timestamps use `timestamp with
time zone` and default to `now()`.

This transaction checks defaults and case-insensitive uniqueness without keeping
test rows. Run interactively in `psql`; the second insert must fail with a unique
constraint violation, then run `ROLLBACK`:

```sql
BEGIN;
SET LOCAL TIME ZONE 'UTC';
INSERT INTO users (id, email, password_hash, display_name)
VALUES ('00000000-0000-4000-8000-000000000001',
        'Foundation.Check@example.invalid', 'test-only-not-a-real-hash', 'Check');
SELECT id, email, created_at, updated_at FROM users
WHERE id = '00000000-0000-4000-8000-000000000001';
INSERT INTO users (id, email, password_hash, display_name)
VALUES ('00000000-0000-4000-8000-000000000002',
        'foundation.check@example.invalid', 'test-only-not-a-real-hash', 'Duplicate');
ROLLBACK;
```

For a persistence check in your development database, insert the first test row
again outside the transaction, reconnect (or restart the backend), select it by
ID, and then delete that test row by ID. Registration is available as described below.

`app/config.py` loads connection settings; `app/database.py` owns the lazy engine
and closing session dependency; `app/models.py` defines ORM metadata and `User`.
Callers must explicitly commit writes. UUIDs are generated by the backend ORM;
raw SQL inserts must supply an ID. The ORM maintains `updated_at` on updates;
direct SQL updates must explicitly set `updated_at = now()`.
`alembic/env.py` shares settings and metadata, `alembic.ini` locates migrations,
and `alembic/script.py.mako` is the template for future revisions.
`alembic/versions/0001_create_users.py` creates only `users` and its email index
(Alembic also maintains its own `alembic_version` tracking table).

On a disposable development database only, `alembic downgrade base` reverses the
migration **and deletes the users table and all its rows**.
Run `alembic upgrade head` to recreate the empty table.

### Verify registration in VS Code with Git Bash

Terminal 1: select **Git Bash** in VS Code. Starting folder:
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`.
Keep your existing private `backend/.env`; do not copy the example over it.

```bash
source .venv/Scripts/activate
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2: open another **Git Bash** terminal, also starting in
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`. This manual request creates a
real development row; automated tests use a separate database. The password below
is a disposable example, not a database credential.

```bash
curl -i http://localhost:8000/api/auth/register \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  --data '{"email":"registration-check@example.com","display_name":"Registration Check","password":"Local-test-password-2026!"}'
```

Expect HTTP 201 with `id`, `email`, `display_name`, `created_at`, and `updated_at`.
Repeat with `REGISTRATION-CHECK@example.com` to get HTTP 409. A password shorter
than 12 characters returns HTTP 422. Passwords and hashes never appear in these
responses; registration creates no cookie. You can also use http://localhost:8000/docs.
See [the API contract](docs/api.md#registration-implemented) for all input limits
and error bodies.

### Review and apply the sessions migration

`backend/alembic/versions/0002_create_sessions.py` creates only the `sessions`
table: UUID primary key, required user foreign key, unique token digest, required
expiration, optional revocation time, and creation timestamp. Indexes support
token lookup, user lookup and expiration. It preserves existing users and does
not change `0001_create_users`. Downgrading to `0001_create_users` removes all
sessions and signs everyone out, but preserves users. Do not downgrade to `base`
unless you intend to delete users too.

After reviewing this change, use **VS Code → Git Bash**, starting folder
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`. Stop the running API with
Ctrl+C before applying the migration. Your current virtual environment is in the
root folder:

```bash
source .venv/Scripts/activate
cd backend
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m alembic current
python -m alembic check
python -m uvicorn app.main:app --reload --port 8000
```

In SQL Shell connected to `devpilot` as `devpilot_app`, verify without displaying
session credentials:

```sql
SELECT version_num FROM alembic_version;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sessions'
ORDER BY ordinal_position;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'sessions';
```

### Verify login and logout locally

Use browser URLs `http://localhost:3000` and `http://localhost:8000` together.
Do not mix `localhost` and `127.0.0.1` for the browser; the database connection can
continue using `127.0.0.1:5432`. These non-secret defaults work with your existing
private `.env`, without changing its database URL:

```dotenv
APP_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:8000
```

Open http://localhost:8000/docs. Login with the disposable account registered
above using `POST /api/auth/login`:

```json
{"email":"registration-check@example.com","password":"Local-test-password-2026!"}
```

Expect 200 with public user fields. Swagger's same-origin request receives the
cookie automatically. Execute `GET /api/users/me` and expect your public profile.
Execute `POST /api/auth/logout` and expect 204; repeat `/api/users/me` and expect
401. Wrong login passwords and unknown emails both return the same 401 message.

The cookie is HttpOnly, SameSite=Lax, host-only, Path `/`, and expires after seven
days. Secure is false only for local development; no sliding renewal is used.
Every unsafe request requires an exact trusted Origin, including registration and
login. Missing/foreign origins return 403; CLI requests must include the Origin
header as shown in the registration example. The API origin is trusted so local
Swagger works; CORS permits only the configured frontend origin with credentials.

For HTTPS deployment set `APP_ENV=production` and explicit HTTPS `FRONTEND_ORIGIN`
and `API_ORIGIN` values, without trailing slashes. This enables Secure cookies and
rejects HTTP origins. Use same-origin hosting/proxying or same-site HTTPS
subdomains; unrelated cross-site frontend/API hosts are not supported. Future
frontend requests use `credentials: "include"` for login, `/api/users/me`, and
logout through the shared `frontend/lib/api.ts` helper.

### Authentication tests (isolated PostgreSQL database)

Tests require an explicit `TEST_DATABASE_URL` for a local database named exactly
`devpilot_test`. They never fall back to `DATABASE_URL` or read `backend/.env`.
They apply all five migrations and **clear the test issues, projects, sessions and users tables before and
after each test**. Never use this database for data you want to keep.

One-time setup for developers who do not yet have that test database: in Windows
**SQL Shell (psql)**, connect as your local PostgreSQL administrator to database
`postgres` at `127.0.0.1:5432`, then run:

```sql
CREATE DATABASE devpilot_test OWNER devpilot_app;
```

This is a separate test database; do not recreate the existing `devpilot` database
or `devpilot_app` role.

In a **Git Bash** terminal starting at
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`:

```bash
source .venv/Scripts/activate
cd backend
python -m pip install -r requirements-dev.txt
# At the hidden prompt, enter a URL for devpilot_test, not devpilot:
# postgresql+psycopg://devpilot_app:URL_ENCODED_PASSWORD@127.0.0.1:5432/devpilot_test
read -r -s -p 'Isolated test database URL: ' TEST_DATABASE_URL
printf '\n'
export TEST_DATABASE_URL
python -m pytest tests -q
unset TEST_DATABASE_URL
```

Enter the real URL only at that local hidden prompt, never in chat or tracked
files. Tests cover public responses, Argon2id hashing and salts, input limits,
case-insensitive duplicates, simultaneous inserts, rollback/session reuse, login,
session persistence, expiration/revocation, cookie properties, current-user lookup,
logout/replay, CSRF rejection, production settings and migration reversibility.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local           # Windows PowerShell: Copy-Item .env.example .env.local
npm run dev
```

Visit http://localhost:3000. The homepage links to `/register` and `/login`.
Registration leads to login with a success message; login opens `/dashboard`
(or restores a directly requested private page). `/account` shows the profile and logout. Keep the backend running
at `http://localhost:8000` and use `localhost` consistently for browser URLs.
The health endpoint remains available at `http://localhost:8000/api/health`.

Shared colors, typography, spacing and radii live in `frontend/app/styles.css`.
Page/component styling uses CSS Modules; no UI framework is installed. The
authentication forms share labeled fields, buttons, validation, loading and error
states. Desktop/mobile screenshots and their review gallery are in
`artifacts/auth-ui/`; the displayed Alex Morgan profile is fictional test data.

## Documentation

- [Product requirements](docs/prd.md)
- [Architecture and decisions](docs/architecture.md)
- [Database design](docs/database.md)
- [API contract](docs/api.md)
- [UI wireframes](docs/wireframes.md)
- [Implementation plan](docs/roadmap.md)

## Next step

Migration 0005 is applied, and the user has confirmed real-browser issue functionality.
Complete board-specific browser acceptance described below.
See `docs/roadmap.md` for the build order.

## Core issues: local commands and acceptance

The issue contract preserves the PRD's five statuses (Backlog, Todo, In Progress,
Review, Done) and four priorities (Low, Medium, High, Urgent). Defaults are Task,
Todo, Medium. Title is trimmed and required, 1–200 characters; optional plain-text
description is limited to 10,000 characters. Omitted PATCH fields stay unchanged;
null/blank description clears it. Other null or unsupported fields are rejected.

Open a project to view its paginated issues and Create issue form. Open an issue
to edit details or status. Archived projects/issues remain readable, but creation
and updates require restoration. Existing session/CSRF/owner checks apply to every
endpoint, including direct issue URLs. Status/type/priority are displayed as text.
The cleanup fix in useApi and the welcome page is preserved: stale results are
ignored, without calling abort() during effect cleanup.

### Migration review: 0005 (approved and applied to devpilot)

The new project detail page requests issues immediately. The missing issues
table caused this section to fail while local devpilot was at 0004. After user
approval, 0005 was applied and owner-scoped issue-list reads passed for all four
existing projects. Unexpected server errors now retain CORS/no-store headers and a generic
JSON error, rather than appearing as a browser network failure. Server exceptions
still propagate for logging. Chrome extension frames in a fetch stack alone do
not establish that the extension caused the failure.

Follow-up error-path verification: 150 backend tests passed (18 existing warnings,
33.18 seconds) against isolated devpilot_test, including three new server-error
regressions. The 14 simulated useApi/welcome checks also passed with zero unhandled
rejections. No connected browser was available; Chrome remains a manual check.

Review [0005_create_issues.py](backend/alembic/versions/0005_create_issues.py).
Upgrade creates only the `issues` table and project/creation-date/ID index. Columns
are id, project_id, title, description, type, status, priority, created_at, updated_at.
It adds a project foreign key, title/description limits, enum checks, and defaults.
It preserves every existing project, ownership value, archive timestamp, account,
and session. All earlier migrations remain unchanged. No data is backfilled.

Downgrade to 0004 drops the issue table/index and **deletes all issues**, while
preserving project/account/session data. No development downgrade is planned.
Only the isolated test database has been downgraded for verification.
**Local devpilot was upgraded to 0005 after explicit approval; no development downgrade was run.**

### Commands for the existing Windows workspace

**PowerShell — starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\backend`.
Read-only current revision check (expected 0005):

```powershell
& ..\.venv\Scripts\python.exe -m alembic current
```

**PowerShell — starting directory:** same `backend` directory.
**Already completed on this machine after explicit approval.** These commands
record the upgrade and verification; no repeat upgrade is needed:

```powershell
& ..\.venv\Scripts\python.exe -m alembic upgrade 0005_create_issues
& ..\.venv\Scripts\python.exe -m alembic current
& ..\.venv\Scripts\python.exe -m alembic check
```

Verified after application: `0005_create_issues (head)` and no new upgrade
operations. Keep the existing private backend/.env; do not print or overwrite it.

**PowerShell, backend terminal — starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\backend`.
After migration application:

```powershell
& ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**PowerShell, separate frontend terminal — starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\frontend`.

```powershell
npm.cmd run dev
```

Use http://localhost:3000 consistently. The API is http://localhost:8000.

**PowerShell, frontend verification terminal — starting directory:** same
`frontend` directory. Stop its dev server before building to avoid sharing .next:

```powershell
npm.cmd run build
```

**PowerShell, isolated-test terminal — starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`.
The existing disposable test cluster below is separate from devpilot, listens
only on loopback port 55432, and has its own non-production test role. It has
been stopped after verification. Never substitute the development URL:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' start -D "$PWD\.local-checks\management-postgres" -l "$PWD\.local-checks\management-postgres.log" -o '-h 127.0.0.1 -p 55432' -w
$env:TEST_DATABASE_URL = 'postgresql+psycopg://devpilot_test_admin@127.0.0.1:55432/devpilot_test'
Set-Location .\backend
& ..\.venv\Scripts\python.exe -m pytest tests -q
Remove-Item Env:TEST_DATABASE_URL
Set-Location ..
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' stop -D "$PWD\.local-checks\management-postgres" -m fast -w
```

**PowerShell, simulated frontend checks — starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`.
These local diagnostic harnesses use installed temporary tooling in ignored
`.local-checks/auth-checks`; they are not real browser tests or app dependencies:

```powershell
node .local-checks/issues-check.cjs
node .local-checks/use-api-check.cjs
node .local-checks/auth-session-check.cjs
```

### Actual verification

- Full backend suite: **150 passed, 18 warnings in 33.18s**, isolated PostgreSQL
  devpilot_test on port 55432. Existing warnings: Starlette TestClient and Alembic
  configuration deprecations. Migration, constraint, ownership, archived-state,
  update, pagination, session, CSRF and persistence tests are included.
- Frontend production build passed with TypeScript checks, nine static pages,
  and the dynamic issue detail route.
- Simulated frontend: **19 issue + 14 useApi/welcome + 24 auth = 57 passed**,
  zero unhandled rejections. Form errors, saved status, clearing descriptions,
  duplicate submissions, stale responses, safe login returns, archived details,
  pagination, and the Chrome cleanup regression are covered.
- No browser was connected. These API and simulated results do not verify Chrome,
  Edge, responsive rendering, or real browser refresh/sign-in behavior.
- No automated tests used devpilot or changed existing projects. No commit/push.

### Precise manual browser checks after approval/application

1. In Chrome, sign in and use a disposable project in your own account; leave
   other existing projects unchanged. Create an issue with just a title. Confirm
   Task/Todo/Medium and the saved detail URL. Return to the project and open it again.
2. Edit title/description/type/priority; change status to In Progress, then Done.
   Save and refresh. Clear the description and confirm it stays cleared. Sign
   out, reopen the issue URL, sign in, and confirm return to that exact issue.
3. Try blank/oversized input. Disconnect the API temporarily, attempt a save,
   verify the draft remains, restore connectivity, and retry. Confirm pending
   controls prevent duplicate submissions and success displays saved values.
4. Archive the disposable project. Open its issue by URL: details/list remain
   readable and Create/Edit actions are absent. A stale editor from another tab
   must receive the archived-project message and retain its input. Restore the
   project, refresh the issue, and confirm edits work again.
5. Sign in with a second account and try the first account's project/issue URL;
   it must be unavailable. Return to the original account afterwards.
6. Check an empty list and pagination with more than 20 disposable issues. Verify
   Previous/Next, stable creation order and no issues leaking between projects.
7. Repeat the create/edit/refresh/re-login path in Edge. In both browsers check
   narrow mobile and desktop widths, long text, Tab/Shift+Tab, Enter/Space,
   native select keyboard control, visible focus, focused errors/success, and
   absence of the cleanup AbortError overlay. Status must be readable without color.

### Issue milestone changed-file inventory

| Files | Responsibility |
| --- | --- |
| backend/alembic/versions/0005_create_issues.py | New issues table, FK/checks/defaults/index; isolated rollback |
| backend/app/models.py | Issue ORM persistence |
| backend/app/schemas/issues.py | Strict create/partial-update and public contracts |
| backend/app/services/issues.py | Parent ownership, archive locking, list/read/write queries |
| backend/app/routes/issues.py, backend/app/main.py | Nested endpoints, registration, issue 404 envelope |
| backend/tests/test_issues.py, backend/tests/conftest.py | Isolated coverage and issue-aware test cleanup |
| frontend/lib/issues.ts, frontend/lib/navigation.ts | Typed API/helpers/enums and safe nested return URLs |
| frontend/components/IssueForm.tsx | Shared validated create/edit/status form and failure retention |
| frontend/components/ProjectIssues.tsx | Paged issue cards, creation and archived/empty/error states |
| frontend/components/IssueDetail.tsx | Saved detail, project state, edit flow, feedback |
| frontend/components/Issues.module.css | Responsive issue styling with existing tokens |
| frontend/components/ProjectDetail.tsx | Issue-section integration |
| frontend/app/projects/[id]/issues/[issueId]/page.tsx | Thin issue-page composition |
| README.md, docs/api.md, database.md, architecture.md, prd.md, wireframes.md, roadmap.md | Contract, status corrections, effects, inventory, commands and checks |

The core issue milestone added no application dependency, labels, comments, assignment, issue archival,
deletion, GitHub or AI feature was added.

## First signed-in project workspace

Implemented: /dashboard, /projects and /projects/[id], using real authenticated
API data. Create and edit projects with a trimmed 1-100-character name and optional
2,000-character description. Dashboard shows up to four newest active projects;
the full list pages through twenty at a time. Active is the default; the Archived
view is at /projects?status=archived. Home and the logo lead to /dashboard
while signed in; My account leads to /account. Signed-out visitors use /.
Project access is enforced by the backend owner filter, not client navigation.

### Applied project foundation migration

Read backend/alembic/versions/0003_create_projects.py. It follows 0002 and only
creates projects with an owner FK, bounded name/description, UTC timestamps,
a nonblank-name check, and an owner/date/id index. It neither changes users or
sessions nor modifies the old migrations. No startup command applies migrations.
Migration 0003 has been applied to local devpilot. The previous save failure was
caused by its missing projects table and was resolved when 0003 was applied.

### Applied migration 0004

Read [0004_project_archival.py](backend/alembic/versions/0004_project_archival.py).
Upgrade adds only nullable `projects.archived_at` (`timestamp with time zone`),
without a default. Existing projects receive NULL and remain active. Project IDs,
owners, names, descriptions, other timestamps, users, and sessions are preserved.
No old migration is modified, and no hard deletion is added.

Downgrade to 0003 drops only this column: project rows remain, but archive
timestamps are lost and all projects become active if upgraded again. Downgrading
further to 0002 deletes all projects. No development downgrade is planned.

**0004 was approved and applied to local devpilot.** Its archive column and
revision were verified. The following earlier upgrade command is historical;
use the current issues commands above for the applied 0005 migration:

```bash
python -m alembic upgrade 0004_project_archival
python -m alembic current
python -m alembic check
python -m uvicorn app.main:app --reload --port 8000
```

Current local revision is 0006_comments_labels. `alembic check` will report
schema drift if any model changes lack a migration. With 0005 applied, no new upgrade operations were detected.
Use localhost for both browser/frontend and API URLs; keep credentials include,
HttpOnly, SameSite=Lax and production Secure settings intact.

### Project management behavior

Edit opens with saved values. Omitted fields in a PATCH stay unchanged; explicit
null or blank description clears it. Names cannot be null or blank. Unsupported
fields and ownership changes are rejected. Recoverable failures retain form edits;
successful saves display the returned saved data and a success message.

Archive requires a confirmation explaining that data is preserved. Archived
projects leave the dashboard/default list, remain accessible in the explicit
Archived view, and have a prominent archived notice on detail. Restore returns
them to active lists. Editing archived projects is blocked in both UI and API.
Repeated archive/restore requests preserve timestamps if already in that state.
No project deletion endpoint exists. See the API contract for exact bodies.

### Acceptance checks

Run the isolated PostgreSQL tests using TEST_DATABASE_URL for devpilot_test as
described above: python -m pytest tests -q. The test harness refuses development
targets and never loads backend/.env. Tests include project ownership, input
validation, CSRF, fresh-connection persistence, logout/re-login and reversible
migration checks. Build frontend with npm run build.

Manual real-browser checks after applying the reviewed migration: sign in, see
the empty dashboard, create a project, open its detail, refresh, log out, revisit
its URL and sign in again. Verify the saved project returns. Use a second account
to check that its list is empty and the first account's project URL is inaccessible.
Check keyboard focus, field errors, retry states, long names/descriptions, paging,
and desktop/mobile layouts. Browser checks are separate from API and build tests.

The earlier project-management milestone excluded issues. Core issues are now
implemented as described below; labels, comments, assignment, deletion,
issue statistics and unrelated hydration-warning work remain excluded.

Historical validation for the first project workspace: the backend suite passed (76 tests) on
a separate temporary PostgreSQL 18 cluster at loopback port 55432, database
devpilot_test. Migration upgrade, downgrade and metadata checks passed there.
The frontend production build passed. Test tooling emitted existing Starlette
TestClient and Alembic configuration deprecation warnings. No real-browser
acceptance or visual checks were possible because no browser was connected.
Those tests did not use devpilot. Its 0003 migration was applied separately later.

Historical project-management validation: `python -m pytest tests -q` passed with
**101 passed, 14 warnings in 25.55s**, using a fresh PostgreSQL 18 test cluster on
loopback port 55432 and database `devpilot_test`. Warnings are existing Starlette
TestClient and Alembic configuration deprecations. `npm run build` passed, including
TypeScript checks and generation of all nine static pages. A first build caught
a Button ref typing issue that was fixed before the successful build.

No browser was connected during this milestone. The baseline “Hiwot fit app”
journey and desktop/mobile/keyboard checks could not be performed. No such project
was created or modified through a substitute HTTP/database check. API tests are
not browser verification. Automated tests never used development data.

After approved migration application, perform these real-browser checks:

1. Find “Hiwot fit app”; reuse it unchanged if present, otherwise create it once.
   Open, refresh, sign out/in, and reopen it to verify the baseline journey.
2. On a separate disposable project, edit → refresh → archive → Archived view →
   restore → sign out/in. Verify persisted names/descriptions and archive states.
3. Cancel archive; check Tab/Shift+Tab containment, Escape, initial focus on Keep
   active, return focus after closing, and focus/announcements after success/error.
4. Check active/archived empty states, pagination, archived detail/Restore,
   validation, recoverable errors retaining edits, expired sessions, and a second
   account's inability to access the first account's projects.
5. Check desktop/mobile layouts, long content, labels, and visible keyboard focus.

### Files changed for project management

| Files | Responsibility |
| --- | --- |
| backend/alembic/versions/0004_project_archival.py | Nullable archive timestamp; reversible schema change |
| backend/app/models.py, schemas/projects.py | ORM state, strict partial edits/actions, public archive state |
| backend/app/services/projects.py, routes/projects.py | Owner-scoped locked writes, filtering, lifecycle endpoints |
| backend/app/main.py, security.py | Archived-edit 409 envelope and PATCH CORS support |
| backend/tests/test_projects.py, test_project_management.py | Public contract and lifecycle/migration/security coverage |
| frontend/lib/projects.ts | Typed edits, archive and restore requests |
| frontend/components/ProjectForm.tsx, ProjectList.tsx | Prefilled edit form, saved values, filtered lists and empty states |
| frontend/components/ProjectDetail.tsx, ConfirmDialog.tsx | Management actions, feedback, archived detail, native modal focus |
| frontend/components/Button.tsx, Workspace.module.css | Ref support and responsive styling with existing tokens |
| frontend/app/projects/page.tsx, projects/[id]/page.tsx | Active/Archived navigation and detail composition |
| README.md, docs/api.md, database.md, roadmap.md, prd.md, architecture.md, wireframes.md | Current contracts, migration status, verification and scope |

### Files changed for the Projects milestone

| Files | Responsibility |
| --- | --- |
| backend/alembic/versions/0003_create_projects.py | Additive project table, constraints and index |
| backend/app/models.py | Project ORM model |
| backend/app/routes/projects.py | Authenticated create/list/detail HTTP endpoints |
| backend/app/schemas/projects.py | Strict input validation and public project/page schemas |
| backend/app/services/projects.py | Owner-scoped queries and committed creation |
| backend/app/main.py, backend/app/security.py | Route registration, project 404 envelope, private response caching policy |
| backend/tests/test_projects.py, backend/tests/conftest.py | PostgreSQL project checks and isolated cleanup |
| frontend/app/dashboard/page.tsx | Signed-in workspace home |
| frontend/app/projects/page.tsx, frontend/app/projects/[id]/page.tsx | Project list/create composition and detail data flow |
| frontend/components/Workspace.tsx, frontend/components/Workspace.module.css | Shared session gate, states and responsive workspace design |
| frontend/components/ProjectList.tsx, frontend/components/ProjectForm.tsx | Reusable API-backed cards/pagination and creation form |
| frontend/lib/projects.ts, frontend/lib/useApi.ts, frontend/lib/navigation.ts | Project contract, request lifecycle and safe login return paths |
| frontend/components/SiteShell.tsx, frontend/components/SiteShell.module.css | Signed-in navigation and mobile wrapping |
| frontend/components/AuthForm.tsx, frontend/app/page.tsx | Login destination and signed-in welcome-page redirect |
| frontend/app/account/page.tsx, frontend/app/account/page.module.css | Shared session handling and workspace link |
| README.md, docs/prd.md, docs/architecture.md, docs/database.md, docs/api.md, docs/wireframes.md, docs/roadmap.md | Implemented scope, contracts, migration review, verification and deferred V1 work |

## Project Kanban board milestone

Implemented: open a project and select **Board**, or use
`/projects/<project-id>?view=board`. **List** returns to the existing issue list
and creation form. Active navigation and safe login return URLs preserve the view.
The user confirmed real-browser issue functionality before this milestone; older
issue-check notes above are historical. Board browser acceptance is still pending.

Columns use Backlog, Todo, In Progress, Review, Done. Each card links to the issue
and shows type, priority and status as text. Choose **Move to**, then **Move**, or
drag on desktop. Cards move only after the API confirms the update. Pending
requests disable competing actions; failures retain the card and selected target,
with retry/refresh recovery. Archived boards are readable with movement disabled.
Mobile has a labeled **Show column** selector and does not require dragging.

The board requests 100 issues initially, across all statuses. **Load older issues**
requests at most 100 more each time until has_more is false. Counts explicitly say
loaded, so a partial board is never presented as complete. There is no total cap;
loaded cards accumulate on explicit demand. Offset paging is not a snapshot:
concurrent creation can shift pages. Duplicate IDs are merged, and **Refresh board**
restarts at zero to discover newer work. Status changes do not affect pagination.
Cards retain API creation-time/UUID order; no manual ordering is introduced.

The board added no migration or application dependency. Its milestone used 0005;
comments/labels subsequently upgraded local head to 0006_comments_labels.
Existing authentication, ownership, CSRF, archived checks, CORS errors and Chrome
stale-result behavior are preserved. No development project was mutated by tests.

### Board changed files

| File | Responsibility |
| --- | --- |
| frontend/components/ProjectDetail.tsx | Compose the view selector under Suspense |
| frontend/components/ProjectIssueViews.tsx | URL-based List/Board links and view composition |
| frontend/components/IssueBoard.tsx | Board toolbar, feedback, mobile selection and focus |
| frontend/components/BoardColumn.tsx | Column drop areas and accessible issue cards/move forms |
| frontend/components/IssueBoard.module.css | Existing design tokens, desktop scrolling, mobile column layout and focus |
| frontend/lib/useIssueBoard.ts | Bounded loading, confirmed moves, deduplication, errors and stale-result protection |
| frontend/tests/board-check.cjs | Repeatable React DOM simulations with mocked fetch/router |
| backend/tests/test_issues.py | 125-issue board/list pagination and status persistence regression |
| README.md; docs/prd.md, architecture.md, database.md, api.md, wireframes.md, roadmap.md | Implemented behavior, constraints, current status and verification |

### Board verification results

- Full backend: **151 passed, 18 existing warnings in 56.88s**, on guarded
  devpilot_test (loopback 55432). Covers ownership, archived rejection, CSRF,
  sessions, all five status changes, pagination and persisted List/Board agreement.
  The isolated test cluster was stopped afterwards.
- Frontend production build: passed, including TypeScript and page generation.
- **18 board simulations + 57 existing frontend checks passed**, with zero
  unhandled rejections. Simulated dragging, mobile selection and focus are not
  actual browser/layout verification.
- No browser was connected. No commit or push was made.

### Exact local commands for the board

**PowerShell, backend terminal; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\backend`

```powershell
& ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**PowerShell, separate frontend terminal; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\frontend`

```powershell
npm.cmd run dev
```

Use http://localhost:3000 consistently. Do not start duplicate servers if these
ports are already in use by your existing terminals.

**PowerShell, frontend build terminal; starting directory:** same frontend
folder. Stop its dev server before building to avoid sharing .next.

```powershell
npm.cmd run build
```

**PowerShell, frontend simulation terminal; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`

```powershell
node frontend/tests/board-check.cjs
node .local-checks/use-api-check.cjs
node .local-checks/issues-check.cjs
node .local-checks/auth-session-check.cjs
```

The board script uses the existing ignored diagnostic jsdom installation at
`.local-checks/auth-checks/node_modules/jsdom` plus frontend React/TypeScript.
This is test tooling, not an application dependency. On a fresh clone, install
that isolated diagnostic dependency first (PowerShell, starting directory: root):

```powershell
npm.cmd install --prefix .local-checks/auth-checks --no-save jsdom@29.1.1
```

The three older .local-checks scripts are local diagnostics and may not exist in
a fresh clone; frontend/tests/board-check.cjs is included in this milestone.

**PowerShell, isolated backend test terminal; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' start -D "$PWD\.local-checks\management-postgres" -l "$PWD\.local-checks\management-postgres.log" -o '-h 127.0.0.1 -p 55432' -w
$env:TEST_DATABASE_URL = 'postgresql+psycopg://devpilot_test_admin@127.0.0.1:55432/devpilot_test'
Set-Location .\backend
& ..\.venv\Scripts\python.exe -m pytest tests -q
Remove-Item Env:TEST_DATABASE_URL
Set-Location ..
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' stop -D "$PWD\.local-checks\management-postgres" -m fast -w
```

This uses the existing disposable local test cluster only. Never substitute the
development URL. No migration command is needed for this milestone.

### Remaining real-browser board checks

1. In Chrome and Edge, open a disposable active project with issues. Select Board;
   confirm five columns in order, card detail links, type/priority/status, empty
   columns and active List/Board navigation. Leave other projects unchanged.
2. Use Tab, native select keys and Enter/Space to choose Move to and confirm. Check
   the pending state, success announcement, destination focus and saved status.
   Switch to List and open the issue; both must agree. Refresh the board URL, sign
   out/in and confirm its saved status and return destination.
3. Drag between desktop columns. Confirm the card moves only after saving, its
   creation order is retained, and external text drops do nothing. Cancel a drag.
4. At a narrow mobile width, use Show column to reach each status and move without
   dragging. Verify destination selection/focus, long titles and visible controls.
5. Stop/disconnect the API, attempt a move, confirm the card and target remain;
   reconnect and retry or refresh. Confirm there is no cleanup AbortError overlay.
6. Archive the disposable project: Board remains readable with all movement
   disabled. A stale active tab must receive an archived message on attempted move.
   Restore and refresh the project to enable movement. A second account must not
   access its project/issue URLs or issue PATCH requests.
7. With more than 100 disposable issues, use Load older issues through completion.
   Check partial counts/empty messages, retries without losing cards, all five
   statuses, and agreement with List pages. Refresh after another tab creates work.

## Comments and labels: migration review and handoff

Comments and labels are implemented. **Local devpilot is at
0006_comments_labels (head), applied after explicit user approval.** Alembic
reported no schema drift. Existing users, sessions, projects and issues were
verified unchanged. Owner-scoped label/issue reads passed for all four projects,
and comment reads passed for the existing issue. Browser acceptance remains separate.

The original docs named comments.body, labels and issue_labels but did not define
limits or colors. Resolved contract: trimmed comment text 1-5,000 characters;
trimmed label names 1-30 characters, unique per project ignoring case; named
blue/green/amber/purple/rose/slate palette. Labels never rely on color alone.
Earlier milestone notes that defer comments/labels are historical; analytics,
global search, assignment, notifications, issue archival/deletion, GitHub and AI
remain future work.

### Behavior

- Issue details include chronological comment pages (oldest first, 20 per page),
  author, creation time and edited indication. Owners add comments, edit their
  own comments and delete after confirmation. Rendered text never becomes HTML.
- Project navigation adds Labels. Create, rename/recolor or delete labels there.
  Alphabetic pagination keeps all labels reachable. Deletion removes assignments
  while preserving issues, and the confirmation explains that effect.
- Issue details support assigning/removing project labels. Details, list cards
  and board cards use the same badge renderer. Other-project labels are rejected
  by both API checks and composite database foreign keys.
- All changes use confirmed responses; drafts remain after recoverable failures
  and pending actions guard duplicate submissions. Repeated assignments/removals
  are safe no-ops. Repeating an already completed comment/label deletion returns
  404. After uncertain POST failures, refresh the section before adding again.
- Archived projects remain readable and prohibit every comment/label write.
  Ownership, own-author checks, session authentication and exact-Origin CSRF run
  on the backend. PUT/DELETE CORS is enabled without altering the error boundary.
- Comment changes refresh only comments; label assignment replaces only local
  labels. Label management does not refetch project data. Switching back to List
  or Board loads saved labels; the board's paging and stale-result logic remain.
  Concurrent changes from another tab require refresh/view re-entry.

### Migration to review

Read [0006_comments_labels.py](backend/alembic/versions/0006_comments_labels.py).
It follows 0005 and leaves all older migrations unchanged. It creates:

| Change | Purpose |
| --- | --- |
| comments | UUID, issue/author FKs, checked body, creation/update timestamps, chronological index |
| labels | UUID, project FK, checked name/palette, case-insensitive per-project unique index |
| issue_labels | Issue/label PK, shared project_id, composite project FKs, reverse label index |
| issues(id, project_id) unique constraint | Supports database-enforced same-project label assignments |

Upgrade preserves existing users, sessions, projects, archival state and issues.
No content is backfilled or rewritten. Creating the issues constraint takes a
brief table lock and adds an index. Label deletion cascades only assignments.
Downgrade removes comments, labels, assignments and the new issues constraint:
**all comment and label data would be lost**, while earlier project/issue/account
rows remain. No development downgrade is planned. Upgrade/downgrade tests ran only on
the isolated test database. The development upgrade was then explicitly approved
and applied; no development downgrade was run.

### Changed files and responsibilities

| Files | Responsibility |
| --- | --- |
| backend/alembic/versions/0006_comments_labels.py | Additive schema and reviewed rollback |
| backend/app/models.py | Comment, Label, IssueLabel; batched Issue.labels relationship |
| backend/app/schemas/organization.py; schemas/issues.py | Strict inputs, public author/comment/label contracts, issue labels |
| backend/app/services/organization.py | Owner/archive/author checks, persistence and predictable mutations |
| backend/app/routes/organization.py; main.py | Nested routes and standard organization errors |
| backend/app/security.py | Allow PUT/DELETE through existing credentialed CORS and Origin checks |
| backend/tests/test_organization.py; test_issues.py; conftest.py | New regressions, updated public contract and guarded cleanup |
| frontend/lib/organization.ts; useOrganizationAction.ts; issues.ts | Typed contracts, mutation guards/errors/stale results, labels on Issue |
| frontend/components/CommentForm.tsx; IssueComments.tsx | Comment drafts, chronological pages, author actions and deletion |
| frontend/components/LabelForm.tsx; ProjectLabels.tsx | Paged label management and confirmed deletion |
| frontend/components/IssueLabels.tsx; LabelBadges.tsx | Issue assignment controls and consistent label text/colors |
| frontend/components/Organization.module.css | Layout, wrapping, controls, focus and accessible palette |
| frontend/components/ConfirmDialog.tsx | Reusable wording; archive defaults and focus behavior preserved |
| frontend/components/IssueDetail.tsx; ProjectIssueViews.tsx; ProjectIssues.tsx; BoardColumn.tsx | Compose new sections/view and badges |
| frontend/tests/organization-check.cjs | Reproducible simulated component behavior checks |
| README.md and six docs files | Contracts, migration status, behavior, verification and remaining scope |

### Actual verification

- Full backend: **183 passed, 22 deprecation warnings in 102.61s** on guarded
  devpilot_test at loopback port 55432. Test cluster stopped afterwards.
- Production build passed, including TypeScript and page generation.
- **15 organization + 18 board + 19 issue + 14 cleanup + 24 auth = 90 simulated
  frontend checks passed**, zero unhandled rejections. The older issue harness
  was updated to provide Workspace user context and the new paginated read mocks.
- Batched label query count verified across 31 issues. Migration metadata matches
  ORM; isolated round trips preserve existing users/sessions/projects/issues.
- All six badge palettes measured between **7.97:1 and 12.04:1** text contrast.
- No connected browser was available. Dialog/fetch/router simulations are not
  Chrome/Edge verification. No secrets were printed, and nothing was committed/pushed.

### Exact local commands

**PowerShell; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\backend`
Read-only revision and migration SQL review (does not apply SQL):

```powershell
& ..\.venv\Scripts\python.exe -m alembic current
& ..\.venv\Scripts\python.exe -m alembic upgrade 0005_create_issues:0006_comments_labels --sql
```

**PowerShell; starting directory:** same backend directory.
**Already completed after explicit approval on this machine.** These commands
record application and verification; no repeat upgrade is needed:

```powershell
& ..\.venv\Scripts\python.exe -m alembic upgrade 0006_comments_labels
& ..\.venv\Scripts\python.exe -m alembic current
& ..\.venv\Scripts\python.exe -m alembic check
```

**PowerShell, backend server terminal; starting directory:** same backend directory.
After migration application:

```powershell
& ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**PowerShell, separate frontend terminal; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\frontend`

```powershell
npm.cmd run dev
```

Use http://localhost:3000. Do not launch duplicate servers on occupied ports.

**PowerShell, frontend build terminal; starting directory:** same frontend
folder; stop its dev server before building to avoid sharing .next.

```powershell
npm.cmd run build
```

**PowerShell, frontend simulations; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`

```powershell
node frontend/tests/organization-check.cjs
node frontend/tests/board-check.cjs
node .local-checks/issues-check.cjs
node .local-checks/use-api-check.cjs
node .local-checks/auth-session-check.cjs
```

Both included frontend test scripts use the existing ignored jsdom@29.1.1 tooling
and installed frontend React/TypeScript. No new runtime dependency was installed.
The older .local-checks scripts are local diagnostics, not tracked app files.

**PowerShell, guarded backend tests; starting directory:** repository root above.
These commands use only the existing disposable test cluster, never devpilot:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' start -D "$PWD\.local-checks\management-postgres" -l "$PWD\.local-checks\management-postgres.log" -o '-h 127.0.0.1 -p 55432' -w
$env:TEST_DATABASE_URL = 'postgresql+psycopg://devpilot_test_admin@127.0.0.1:55432/devpilot_test'
Set-Location .\backend
& ..\.venv\Scripts\python.exe -m pytest tests -q
Remove-Item Env:TEST_DATABASE_URL
Set-Location ..
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' stop -D "$PWD\.local-checks\management-postgres" -m fast -w
```

### Remaining browser checks after migration approval/application

1. In Chrome and Edge, use a disposable project/issue. Create a label, try its
   differently capitalized duplicate, rename/recolor, assign/remove on an issue,
   and verify its names on List and Board after switching views. Confirm board
   movement and loading older issues remain functional.
2. Add a comment containing plain-text markup. Confirm author/date, edit it,
   verify Edited and refresh/sign out/in to check persistence. Page through more
   than 20 comments and labels; chronological/alphabetic navigation must reach all.
3. Cancel each delete dialog, then confirm deletion. Check initial cancel focus,
   Escape, keyboard containment, disabled pending actions, error focus and return
   focus. Label deletion must remove assignments without deleting issues.
4. Disconnect the API during add/edit/delete/assignment. Verify retained drafts,
   no duplicate pending writes, readable errors, and successful refresh/retry.
   For uncertain adds, inspect saved pages before retrying.
5. Archive the project and verify comments/labels remain readable with mutation
   controls absent. A stale active tab must receive the archived error. Restore,
   refresh, and check edits work. Try direct IDs as a second account and reject
   labels from another project.
6. At desktop and narrow mobile widths, verify wrapping, native selects, visible
   focus, readable badge names, keyboard controls and announcements. Check Chrome
   for absence of cleanup AbortError/unhandled fetch overlays.

## Issue filtering and real-data dashboard: latest handoff

Implemented project-scoped status, priority, type, label and title filters shared
by List and Board. Apply writes URL parameters; Clear restores the full list.
The backend combines selected filters with AND before bounded pagination. Label
filtering selects one exact project label; title search is a trimmed,
case-insensitive literal substring of at most 200 characters. All matching issues
are reachable: List pages by 20 and Board loads 100 per explicit request.
A confirmed move outside a status filter removes its card and corrects the next
offset. No optimistic changes or manual ordering were added.

The dashboard now calls GET /api/dashboard for real counts and recent work:
active projects, all their issues including Done, all five status counts, up to
six recently updated issues and four recently updated projects. Archived projects
and their issues are excluded. Links open saved details. Timestamp scope is
explained onscreen; comments/label changes do not update the issue timestamp and
issue activity does not update its project timestamp. Refresh obtains current
data. Historical trends/activity analytics and global search remain deferred.

Documentation conflicts resolved: old deferred-filter/count statements are
superseded, newest-created dashboard projects are now ordered by project update
time, and the sketched per-project summary is replaced by the implemented account
summary. Enum values, response envelopes, ownership and mutation contracts remain
unchanged. No new dependencies or database migration are necessary.

### Changed files and responsibilities

| Files | Responsibility |
| --- | --- |
| backend/app/routes/issues.py; services/issues.py | Validate issue query parameters and apply owner-scoped SQL filtering before pagination |
| backend/app/routes/dashboard.py; schemas/dashboard.py; services/dashboard.py | Authenticated typed dashboard contract, SQL counts and bounded recent selections |
| backend/app/main.py; security.py | Register dashboard route and preserve no-store on private responses |
| backend/tests/test_filter_dashboard.py | PostgreSQL filter/search/validation/pagination/ownership/archive/count/query-bound coverage |
| frontend/lib/issueFilters.ts | Shared query parsing, encoding and project-view links |
| frontend/components/IssueFilters.tsx; IssueFilters.module.css | Accessible URL filter form and bounded label choices |
| frontend/components/ProjectIssueViews.tsx; ProjectIssues.tsx | Shared filters, URL navigation, keyed paging reset, list error and empty states |
| frontend/lib/useIssueBoard.ts; components/IssueBoard.tsx | Filtered board loading, confirmed move-out offset correction, announcements and focus |
| frontend/lib/dashboard.ts; components/Dashboard.tsx; Dashboard.module.css | Typed real-data dashboard and responsive summary/recent-work UI |
| frontend/app/dashboard/page.tsx | Workspace/dashboard composition |
| frontend/tests/filter-dashboard-check.cjs; board-check.cjs | New filtering/dashboard simulations and existing board harness integration |
| README.md and all six docs/*.md | Implemented contracts, scope, query behavior, migration status and verification handoff |

### Actual verification and migration status

- Full backend suite: **197 passed, 22 warnings in 66.37s**, isolated PostgreSQL
  devpilot_test on loopback port 55432. Warnings are existing Starlette TestClient
  and Alembic configuration deprecations. Tests cover filter combinations/literal
  search, invalid parameters, matching pages beyond 100, List/Board query agreement,
  ownership, archived reads/exclusion/restoration, empty/expired accounts, totals,
  deterministic ties, recent caps and bounded SQL query count, plus all regressions.
- **104 frontend simulations passed**, zero unhandled rejections: 14 new
  filtering/dashboard + 15 organization + 18 board + 19 issue + 14 cleanup + 24
  authentication checks. Real React DOM/jsdom with mocked fetch/router; URL/history
  changes and drag events are simulated, not actual browser interactions.
- **Production build passed**, including type validation and nine static pages.
  PowerShell requires npm.cmd here; npm.ps1 is blocked by the local execution policy.
- Read-only development check returned **database devpilot, revision
  0006_comments_labels**. No migration created/applied, no development data changed.
  The isolated test cluster was stopped after testing. No commit or push.
- Browser inventory returned no available browsers. Real browser checks below
  remain outstanding; existing user-confirmed issue functionality is unaffected.

### Remaining real-browser checks

Use a disposable project and account in Chrome and Edge at localhost:3000:

1. Create issues spanning all five statuses, four priorities, three types and
   multiple labels. Apply each filter and combinations, including title search
   with mixed case, percent and underscore. Confirm only matching titles appear.
2. Switch List/Board/Labels and back; refresh, use Back/Forward, and paste the
   filtered URL into a new tab. Controls and matching data must agree. Clear
   filters, test zero matches, and check a genuinely empty project separately.
3. With more than 100 matching issues, page the List and load all Board pages.
   Move a card out of the selected status, then load the next page: no skipped
   row, success announcement, focus on the board heading. Test failed requests,
   retry, and fast filter/navigation changes while old reads are still pending.
4. Compare dashboard totals/status counts with saved active work. Archive and
   restore a project, revisit/refresh dashboard, and verify exclusions/counts.
   Change issue status, refresh and sign out/in. Check recent-work links and
   ordering by the documented update timestamp, including Done.
5. Check empty and expired accounts, a second account, offline errors and retry.
   Test desktop and narrow mobile layouts, Tab/Enter/Space focus, labeled filters,
   mobile column selection and keyboard movement. Confirm no Chrome cleanup or
   unhandled request overlay. Do not use existing personal projects as test data.

### Exact local commands

**PowerShell - backend server; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\backend`

```powershell
& ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**PowerShell - frontend server, separate terminal; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\frontend`

```powershell
npm.cmd run dev
```

Open http://localhost:3000. Reuse running servers rather than launching duplicates.

**PowerShell - production build; starting directory:** same frontend directory.
Stop the frontend dev server first so it does not share the .next build directory.

```powershell
npm.cmd run build
```

**PowerShell - frontend simulations; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`

```powershell
node frontend/tests/filter-dashboard-check.cjs
node frontend/tests/organization-check.cjs
node frontend/tests/board-check.cjs
node .local-checks/issues-check.cjs
node .local-checks/use-api-check.cjs
node .local-checks/auth-session-check.cjs
```

These use the existing ignored .local-checks/auth-checks/node_modules/jsdom
installation and frontend React/TypeScript. The older three .local-checks scripts
are local diagnostics, not tracked application dependencies.

**PowerShell - full backend tests; starting directory:** same repository root.
Use only the existing isolated test cluster/database below, never devpilot.

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' start -D "$PWD\.local-checks\management-postgres" -l "$PWD\.local-checks\management-postgres.log" -o '-h 127.0.0.1 -p 55432' -w
$env:TEST_DATABASE_URL = 'postgresql+psycopg://devpilot_test_admin@127.0.0.1:55432/devpilot_test'
Set-Location .\backend
& ..\.venv\Scripts\python.exe -m pytest tests -q
Remove-Item Env:TEST_DATABASE_URL
Set-Location ..
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' stop -D "$PWD\.local-checks\management-postgres" -m fast -w
```

**PowerShell - optional read-only migration check; starting directory:**
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter\backend`

```powershell
& ..\.venv\Scripts\python.exe -m alembic current
```

Expected revision: 0006_comments_labels (head). No upgrade command is needed.
