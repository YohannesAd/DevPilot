# DevPilot

DevPilot is a workspace for individual developers to organize projects and track bugs, features, and tasks. V1 covers accounts, projects, issues, labels, comments, a Kanban board, and a basic dashboard. GitHub integration and AI are later phases.

## First coding milestone

This repository begins with a small vertical slice: a FastAPI health endpoint and a Next.js page that fetches it. It proves the two applications can communicate before authentication or database work begins. No account or issue data exists yet.

## Open in VS Code

Open the `devpilot-starter` folder using **File → Open Folder**. Run the backend and frontend in separate VS Code terminals.

### Backend

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
The first Alembic migration has not yet been run against this local database.

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

The current revision should be `0001_create_users (head)`, and `alembic check`
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
ID, and then delete that test row by ID. No account endpoints exist yet.

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

Verify the database migration using the steps above. Registration, login, projects,
and issues are future work. See `docs/roadmap.md` for the order and acceptance checks.
