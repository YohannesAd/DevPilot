# Testing and dependency maintenance

All commands below label shell and starting directory. `<repo>` is the repository
root (locally C:\Users\yohan_0namuao\Downloads\DevPilot-starter).

## Backend isolation

The fixture accepts only PostgreSQL+psycopg, a loopback host, database devpilot_test,
and no connection query overrides. It fails closed without TEST_DATABASE_URL,
replaces configuration before Alembic runs, prohibits the development engine and
injects the test Session into FastAPI. It truncates only this disposable database.
Migration tests downgrade/re-upgrade **only the disposable database**.

On this Windows machine the existing isolated cluster lives in the ignored
.local-checks/management-postgres and listens on 55432. It is not required by CI.

**PowerShell; starting directory: `<repo>` (existing local disposable cluster):**

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' start -D "$PWD\.local-checks\management-postgres" -l "$PWD\.local-checks\management-postgres.log" -o '-h 127.0.0.1 -p 55432' -w
$env:TEST_DATABASE_URL = 'postgresql+psycopg://devpilot_test_admin@127.0.0.1:55432/devpilot_test'
Set-Location backend
& ..\.venv\Scripts\python.exe -m pytest tests -q
Remove-Item Env:TEST_DATABASE_URL
Set-Location ..
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' stop -D "$PWD\.local-checks\management-postgres" -m fast -w
```

For a fresh computer, use a dedicated disposable PostgreSQL service. The following
Docker example has a **public, disposable-only** password and binds only loopback.
It creates a fresh container, not your devpilot database. Docker was unavailable
in this review; this is the same service contract used by GitHub Actions, not a
claim of a locally executed container run.

**PowerShell with Docker installed; starting directory: `<repo>`:**

```powershell
docker run --name devpilot-release-test -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=devpilot_test_admin -e POSTGRES_PASSWORD=disposable-ci-only -e POSTGRES_DB=devpilot_test postgres:18.6
docker exec devpilot-release-test pg_isready -U devpilot_test_admin -d devpilot_test
```

Wait for pg_isready to report accepting connections before proceeding. Do not
start this container while another test cluster occupies 55432.

**PowerShell; starting directory: `<repo>\backend` (disposable container only):**

```powershell
$env:DATABASE_URL = 'postgresql+psycopg://devpilot_test_admin:disposable-ci-only@127.0.0.1:55432/devpilot_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
& ..\.venv\Scripts\python.exe -m alembic upgrade head
& ..\.venv\Scripts\python.exe -m scripts.check_schema --database devpilot_test
& ..\.venv\Scripts\python.exe -m pytest tests -q
& ..\.venv\Scripts\python.exe -m scripts.check_schema --database devpilot_test
Remove-Item Env:DATABASE_URL, Env:TEST_DATABASE_URL
docker rm -f devpilot-release-test
```

## Frontend and CI

**PowerShell; starting directory: `<repo>\frontend` (stop the dev server before build):**

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd audit --audit-level=moderate
```

`npm test` runs six independent tracked Node harnesses with installed jsdom and
React/TypeScript. Mocked fetch/router, Strict Mode, pagination, confirmed writes,
errors and stale results are covered. It is not a browser, visual or network E2E
suite. CI runs those same commands on Linux, plus backend hash installation,
pip check, fresh migrations, read-only schema checks before/after the full suite,
and dependency audits. Action revisions are immutable SHAs. Audit tools use a
separate environment so their dependencies do not change the app installation.
An audit can fail on a newly published advisory or service outage: investigate,
never add a blanket bypass to make CI green. Review current results in the release
review; no hosted GitHub Actions execution has occurred in this session.

## Read-only development schema check

**PowerShell; starting directory: `<repo>\backend`:**

```powershell
& ..\.venv\Scripts\python.exe -m scripts.check_schema --database devpilot
```

Target name, actual database, single migration head and Alembic metadata diff are
checked in a read-only transaction. Alembic detects tables/columns/types/indexes/
foreign keys within its supported comparison surface; this is not a complete
SQL-equivalence proof for every check expression or server default. Isolated
migration and direct-constraint tests supplement that check.

## Dependency updates and audits

requirements.txt and requirements-dev.txt define supported ranges; their .lock
files contain exact transitive versions and hashes for Python 3.13 on Windows and
Linux. The initial locks preserve the previously tested installed versions;
uvloop has a non-Windows marker. npm ci uses the existing package-lock.json.
PostCSS is overridden to 8.5.28 to fix audited vulnerabilities without moving
Next.js 15 or React to another major version. Remove/revisit the override once a
compatible Next release carries a patched dependency, and rerun checks/build.

**PowerShell; starting directory: `<repo>` (separate maintenance tooling):**

```powershell
py -3.13 -m venv .local-checks/release-tools
& .\.local-checks\release-tools\Scripts\python.exe -m pip install uv==0.12.21 pip-audit==2.10.1
& .\.local-checks\release-tools\Scripts\uv.exe pip compile backend/requirements-dev.txt --universal --python-version 3.13 --generate-hashes --constraint backend/requirements-dev.lock --output-file backend/requirements-dev.lock
& .\.local-checks\release-tools\Scripts\uv.exe pip compile backend/requirements.txt --universal --python-version 3.13 --generate-hashes --constraint backend/requirements-dev.lock --output-file backend/requirements.lock
& .\.local-checks\release-tools\Scripts\python.exe -m pip_audit --disable-pip --require-hashes -r backend/requirements-dev.lock
```

Constraints intentionally preserve approved versions. To update a package,
review/change its constraint deliberately and regenerate; inspect the full diff,
repeat clean installs, tests and build. Do not use npm audit fix --force. Tools
may need your organization's trusted CA configuration on managed Windows machines;
never disable certificate validation. CI uses public TLS trust on hosted runners.
