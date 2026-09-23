# DevPilot

DevPilot is a workspace for individual developers to organize projects and track bugs, features, and tasks. V1 covers accounts, projects, issues, labels, comments, a Kanban board, and a basic dashboard. GitHub integration and AI are later phases.

## First coding milestone

This repository began with a small vertical slice: a FastAPI health endpoint and a Next.js page that fetches it. PostgreSQL persistence, registration, login, persistent sessions, current-user lookup and logout are now implemented in the backend. Authentication screens and issue tracking remain future work.

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
database. Login now requires the additive `0002_create_sessions` migration, which
has not been applied to your local database by this implementation. Review it below.

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

After reviewing the configuration and migration, run the following from
`backend`, with its virtual environment active:

```bash
alembic upgrade head
alembic current
alembic check
```

After upgrading, the current revision should be `0002_create_sessions (head)`, and `alembic check`
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
frontend requests need `credentials: "include"` for login, `/api/users/me`, and
logout. No frontend auth screens are added here.

### Authentication tests (isolated PostgreSQL database)

Tests require an explicit `TEST_DATABASE_URL` for a local database named exactly
`devpilot_test`. They never fall back to `DATABASE_URL` or read `backend/.env`.
They apply both migrations and **clear the test sessions and users tables before and
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

Visit http://localhost:3000. The page should say **API connected** while the backend is running. Both apps run locally. PostgreSQL provides the database foundation; the health page still checks only API connectivity.

## Documentation

- [Product requirements](docs/prd.md)
- [Architecture and decisions](docs/architecture.md)
- [Database design](docs/database.md)
- [API contract](docs/api.md)
- [UI wireframes](docs/wireframes.md)
- [Implementation plan](docs/roadmap.md)

## Next step

Review the sessions migration and verify login/current-user/logout using the steps
above. Frontend auth screens, projects and issues remain future work.
See `docs/roadmap.md` for the build order.
