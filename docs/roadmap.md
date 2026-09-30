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
| 5b — Comments and labels | Implemented: comment create/read/edit/delete, project labels and issue assignments | 183 backend tests; build; 15 new + 75 existing simulated frontend checks passed; 0006 approved/applied |
| 6 — Board | Implemented: List/Board views, five columns, confirmed moves, keyboard controls, desktop dragging and mobile column selector | 151 backend tests; production build; 18 board + 57 existing simulated checks passed; board browser acceptance pending |
| 6b — Filtering and dashboard | Shared URL filters, server title search, active-work totals and bounded recent work | 197 backend tests; 104 simulated frontend checks; production build; browser acceptance pending |
| 7 — V1 quality | Release review and CI implemented; core browser journey confirmed by user | Local clean setup: 200 backend / 105 frontend checks and build passed; hosted Actions, production configuration and staging acceptance remain |

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
is needed for the board. Assignment, issue archival/deletion, global search,
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

## Comments and labels handoff

Full backend: **183 passed, 22 existing deprecation warnings in 102.61s** on
guarded devpilot_test. Coverage includes strict validation, own-author edits,
case-insensitive label conflicts, cross-account/project IDs, archived rejection,
sessions, PUT/DELETE CSRF/CORS, chronological/alphabetical pagination, repeated
actions, label cascade deletion preserving issues, batching, direct DB constraints,
and migration upgrade/downgrade preserving earlier data. Test cluster stopped.

Production build passed. **15 organization + 18 board + 19 issue + 14 cleanup +
24 auth = 90 simulated checks passed**, zero unhandled rejections. Dialog APIs,
fetch and routing are simulated, so these do not establish real browser results.
Palette contrast was measured at 7.97:1 or higher for all six color pairs.
No browser was connected; previous real-browser issue confirmation remains valid,
but new comment/label/board visual and keyboard acceptance remains separate.

After explicit approval, local devpilot was upgraded from 0005 to
**0006_comments_labels (head)**. Alembic check reports no schema drift. Existing
users, sessions, projects and issues were verified unchanged; read-only label/issue
queries passed for all four projects and comments for the existing issue. No
development downgrade was run. Next: complete the README browser checklist. Historical analytics, global search, assignment, notifications,
issue archival/deletion, GitHub and AI remain deferred. No commit or push.

## Filtering and dashboard handoff

Implemented: shared URL filters and literal title search before pagination,
matching List/Board views, status-filtered move offset correction, active-work
aggregates and bounded recent work. Previous statements deferring issue filters
or dashboard counts are superseded; historical analytics/global search remain
future. No migration: read-only local check confirmed 0006_comments_labels.

Full isolated backend suite: 197 passed, 22 existing deprecation warnings in
66.37s. Frontend: 14 new filtering/dashboard checks plus 90 regression checks
passed (104 total), with zero unhandled rejections. These use React DOM/jsdom,
mocked requests and simulated routing; they are not browser verification.
Production build passed including TypeScript and all nine static pages. No new
dependencies. Test PostgreSQL cluster stopped after testing. Browser inventory
reported no browsers; Chrome/Edge, responsive layout, actual Back/Forward/copied
links and keyboard acceptance remain in the README checklist. No commit/push.

## Release-readiness review

The current user confirms the core journey in a real browser. The independent
release review reran source-only setup and checks: 200 backend tests, 105 tracked
frontend simulations, successful production build and dependency audits. GitHub
Actions is implemented but has not yet run on GitHub. Local devpilot remains at
0006_comments_labels with no metadata differences under read-only comparison.
See [release findings](release-readiness.md), [testing commands](testing.md) and
[production decisions](deployment.md). Older verification sections are historical.
