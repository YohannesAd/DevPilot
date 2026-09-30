# DevPilot

DevPilot is a private project workspace: accounts, project archive/restore,
issues, Kanban, comments, labels, project filters and a real-data dashboard.
Next.js/React/TypeScript provide the UI; FastAPI/SQLAlchemy/PostgreSQL provide the
API. Code schema head and local `devpilot` are at `0007_auth_rate_limits`.
The rate-limit migration was approved and applied on 2026-09-30; read-only
verification found zero schema differences.

## Supported development environment

Use **Python 3.13, Node.js 22.13+ within 22.x, and PostgreSQL 18**. CI uses the same
runtime lines. Python installs use hashed lockfiles; frontend installs use
package-lock.json. Windows commands below use PowerShell and explicit executable
paths, so shell activation and PowerShell script-policy changes are unnecessary.
`<repo>` means your DevPilot-starter directory; locally it is
`C:\Users\yohan_0namuao\Downloads\DevPilot-starter`.

## First setup

Install the runtimes and PostgreSQL. On a **new installation only**, create a
local database and login role. Existing developers must reuse their database.

**SQL Shell (psql), connected to the local administrator database `postgres`;
starting directory: any directory:**

```sql
CREATE ROLE devpilot_app LOGIN;
\password devpilot_app
CREATE DATABASE devpilot OWNER devpilot_app;
```

**PowerShell; starting directory: `<repo>` (new virtual environment only):**

```powershell
py -3.13 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --require-hashes -r backend/requirements-dev.lock
& .\.venv\Scripts\python.exe -m pip check
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
```

Edit backend/.env privately with the database credentials. URL-encode special
characters in the password. Never commit or share these files. Environment
variables override .env values. Use localhost for both browser origins; do not
mix localhost and 127.0.0.1 in browser URLs.

**PowerShell; starting directory: `<repo>\frontend`:**

```powershell
npm.cmd ci
```

On a **new empty database**, review migrations before the following command.
The existing local devpilot database already has migration 0007 applied;
review [its effects and operational setup](docs/auth-rate-limits.md).

**PowerShell; starting directory: `<repo>\backend` (new database only):**

```powershell
& ..\.venv\Scripts\python.exe -m alembic upgrade head
& ..\.venv\Scripts\python.exe -m scripts.check_schema --database devpilot
```

The schema checker enforces a read-only transaction and verifies the target name,
Alembic head and ORM metadata agreement. It never applies or rolls back migrations.

## Run locally

**PowerShell, backend terminal; starting directory: `<repo>\backend`:**

```powershell
& ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --no-proxy-headers
```

**PowerShell, separate frontend terminal; starting directory: `<repo>\frontend`:**

```powershell
npm.cmd run dev
```

Open http://localhost:3000. API documentation is at http://localhost:8000/docs.
The health endpoint is http://localhost:8000/api/health (process health only).
Do not launch duplicate servers on occupied ports.

## Checks

**PowerShell; starting directory: `<repo>\frontend`:**

```powershell
npm.cmd test
npm.cmd audit --audit-level=moderate
```

Frontend checks use real React DOM in jsdom with simulated fetch/router. They
are not real browser tests and now run entirely from repository dependencies.
Stop the frontend dev server before building because both use .next.

**PowerShell; starting directory: `<repo>\frontend`:**

```powershell
npm.cmd run build
```

Backend tests intentionally truncate and migrate their database. They accept only
loopback PostgreSQL named **devpilot_test**, never devpilot. Follow the isolated
[testing commands](docs/testing.md), or let [GitHub Actions](.github/workflows/checks.yml)
create its disposable PostgreSQL service. CI needs no local .env or account secrets.
The user confirmed the previous hosted Actions run passed. The new authentication
limiter changes still require their own hosted run after you choose to push.

## Project guide

- [Product scope](docs/prd.md), [architecture](docs/architecture.md),
  [database](docs/database.md), [API](docs/api.md), [screens](docs/wireframes.md),
  [roadmap](docs/roadmap.md).
- [Release review: findings, coverage, verification and changed files](docs/release-readiness.md).
- [Production configuration and deployment decisions](docs/deployment.md).
- [Authentication limits, proxy trust, retention and migration review](docs/auth-rate-limits.md).
- [Testing and dependency maintenance](docs/testing.md).
- [Historical milestones and inventories](docs/milestone-history.md) are archived
  evidence, not current setup instructions.

Public deployment still needs the production decisions and checks documented
above. Nothing in this repository deploys automatically.
