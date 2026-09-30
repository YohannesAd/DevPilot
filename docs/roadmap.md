# Build order and progress

| Milestone | Work | Check |
| --- | --- | --- |
| 0 — Product and design | PRD, architecture, relationships, API sketch, screens | Complete |
| 1 — Local vertical slice | FastAPI health route; original health-check page now replaced by the branded welcome page | Health endpoint retained |
| 2 — Persistence | PostgreSQL connection, ORM, Alembic users migration | Applied and verified locally; isolated migration checks cover persistence |
| 3 — Accounts | Backend registration, login, persistent sessions, current-user lookup, logout and Origin CSRF checks implemented; frontend registration, login and account flows implemented | Isolated tests cover credentials, sessions, CSRF and project/issue ownership; browser acceptance still required |
| 4 — First project workspace | Create, owner-scoped list/detail, dashboard and private navigation implemented | 0003 applied locally; browser acceptance pending |
| 4b — Project management | Edit, archive, restore, filtered lists, archived detail, confirmation implemented | 0004 approved/applied locally; browser acceptance pending |
| 5 — Core issues | Create/list/read/edit/status implemented with owner-scoped access and archived-project restrictions | 0005 approved/applied; real-browser issue functionality confirmed by user |
| 5b — Issue organization | Future: labels, comments, assignment, issue archival; no deletion in this milestone | Not implemented |
| 6 — Board | Implemented: List/Board views, five columns, confirmed moves, keyboard controls, desktop dragging and mobile column selector | 151 backend tests; production build; 18 board + 57 existing simulated checks passed; board browser acceptance pending |
| 7 — V1 quality | Remaining: accessibility review, CI, deployment, full browser acceptance | Complete V1 journey still required |

After V1: GitHub integration, focused AI assistance, repository indexing/RAG, background jobs, then team collaboration. At each step, review why the code exists, implement one feature, test its meaningful behavior, and update the documentation.

Milestone 4b implements editing, archiving and restoring, with no hard deletion.
A read-only check in the issues milestone confirmed local devpilot at
0004_project_archival. Old claims that 0004 was awaiting approval were stale;
it was approved and applied separately. After explicit user approval,
0005_create_issues was applied to devpilot and verified as head with no schema
drift. All four existing projects were preserved; their issue-list reads passed.

Historical project-management verification: `python -m pytest tests -q` returned **101 passed, 14 warnings in
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

## Core issues verification and handoff

Full backend suite: **150 passed, 18 warnings in 33.18s** on guarded PostgreSQL
`devpilot_test` at loopback port 55432. Warnings are existing Starlette TestClient
and Alembic configuration deprecations. Tests cover defaults/allowed values,
validation, partial updates/null description, field spoofing, ownership and
mismatched IDs, archived read-only behavior/restore, deterministic pagination,
sessions/CSRF, persistence across fresh connections and re-login, direct database
constraints, and migration preservation. No automated test used devpilot.

`npm run build` passed (Next.js 15.5.26, TypeScript validation, nine static pages
plus project/issue dynamic routes). Local simulated React DOM/fetch/router checks:
**19 issue + 14 useApi/welcome + 24 auth = 57 passed**, zero unhandled rejections.
They cover form values/errors/duplicate submits, status edits, pagination,
archived/missing states, safe return URLs, late responses and the existing Chrome
cleanup regression. Tooling lives in ignored `.local-checks`; no application
dependency was added. These results are NOT real browser verification.

No browser was connected. Chrome/Edge refresh/re-login, desktop/mobile, keyboard
focus and visual acceptance remain pending. The precise manual checklist and
terminal/directory-labeled commands are in README. Development data, including
other existing projects, was not modified. Nothing was committed or pushed.

The user subsequently confirmed real-browser issue functionality. Next: complete
board-specific browser acceptance; 0005 is already applied and no board migration
is needed. Comments, labels, assignment, issue archival/deletion, global search,
GitHub and AI remain outside this milestone.

## Board verification

Full backend suite: **151 passed, 18 existing warnings in 56.88s** against guarded
devpilot_test. New coverage loads 125 issues through board-sized pages, moves an
older issue through every status, rejects an invalid status, signs out/in and
compares every list page with the board's ordering and saved values. Existing
ownership, CSRF, expired-session, archive/restore and CORS error tests also passed.
The test cluster was stopped afterwards; no development project was changed.

Production build passed. **18 board simulations and 57 existing frontend checks
passed**, with zero unhandled rejections. Board coverage includes confirmed
moves, dragging events, rejected/network requests, retry, archived controls,
multi-page loading, duplicate-page handling, stale/unmounted responses, focus,
mobile selection, List/Board agreement, refresh and expired-session navigation.
These use React DOM with mocked fetch/router; they are not real browser tests.
No browser was connected during this milestone. README contains the remaining
Chrome/Edge, desktop/mobile, keyboard and drag acceptance checks and exact commands.
