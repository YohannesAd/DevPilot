# Build order and progress

| Milestone | Work | Check |
| --- | --- | --- |
| 0 — Product and design | PRD, architecture, relationships, API sketch, screens | Complete |
| 1 — Local vertical slice | FastAPI health route; original health-check page now replaced by the branded welcome page | Health endpoint retained |
| 2 — Persistence | PostgreSQL connection, ORM, Alembic users migration | Applied and verified locally; isolated migration checks cover persistence |
| 3 — Accounts | Backend registration, login, persistent sessions, current-user lookup, logout and Origin CSRF checks implemented; frontend registration, login and account flows implemented | Isolated tests cover credentials, cookies, expiration/revocation, current-user identity and CSRF; follow README for local verification. Project ownership tests added in milestone 4; issue checks remain future work |
| 4 — First project workspace | Create, owner-scoped list/detail, dashboard and private navigation implemented | 0003 applied locally; browser acceptance pending |
| 4b — Project management | Edit, archive, restore, filtered lists, archived detail, confirmation implemented | 101 backend tests passed; production build passed; 0004 awaits explicit approval for local devpilot; browser acceptance pending |
| 5 — Issues | Planned: CRUD, type, priority, labels, comments | Not implemented; ownership/relationship tests required when built |
| 6 — Board | Planned: five columns, status editing and optional drag and drop | Not implemented; persisted status must be verified when built |
| 7 — V1 quality | Remaining: accessibility review, CI, deployment, full browser acceptance | Complete V1 journey still required |

After V1: GitHub integration, focused AI assistance, repository indexing/RAG, background jobs, then team collaboration. At each step, review why the code exists, implement one feature, test its meaningful behavior, and update the documentation.

Milestone 4b implements editing, archiving and restoring, with no hard deletion.
A read-only check confirmed local devpilot at 0003_create_projects. The old
pending-0003 statements were stale. New 0004_project_archival adds a nullable
archive timestamp and is NOT applied to devpilot; explicit user approval is
required after reviewing its upgrade/downgrade effects. New code requires 0004.

Verification: `python -m pytest tests -q` returned **101 passed, 14 warnings in
25.55s** on a fresh PostgreSQL 18 cluster at loopback port 55432, database
devpilot_test. Warnings are existing Starlette TestClient and Alembic configuration
deprecations. Coverage includes partial edits/clearing, persistence/re-login,
authentication/CSRF/ownership, filtering/pagination, idempotent archive/restore,
archived-edit rejection, PATCH CORS, and migration preservation. `npm run build`
passed including type checks and generation of nine static pages. No automated
tests used development data.

No browser was connected. The existing “Hiwot fit app” baseline journey, new
edit/archive/restore browser journey, desktop/mobile layouts, and keyboard/dialog
focus checks remain unverified. API TestClient results are not browser results.
No existing “Hiwot fit app” contents were changed. Use a separate disposable
project for mutation checks after the approved migration is applied.

Next: approve/apply 0004, then complete README browser acceptance. Issues/board
work and hydration-warning investigation are outside this milestone.
