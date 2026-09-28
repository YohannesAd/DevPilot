# Build order and progress

| Milestone | Work | Check |
| --- | --- | --- |
| 0 — Product and design | PRD, architecture, relationships, API sketch, screens | Complete |
| 1 — Local vertical slice | FastAPI health route; original health-check page now replaced by the branded welcome page | Health endpoint retained |
| 2 — Persistence | PostgreSQL connection, ORM, Alembic users migration | Applied and verified locally; isolated migration checks cover persistence |
| 3 — Accounts | Backend registration, login, persistent sessions, current-user lookup, logout and Origin CSRF checks implemented; frontend registration, login and account flows implemented | Isolated tests cover credentials, cookies, expiration/revocation, current-user identity and CSRF; follow README for local verification. Project ownership tests added in milestone 4; issue checks remain future work |
| 4 — First project workspace | Create, owner-scoped list/detail, dashboard and private navigation implemented; edit/archive deferred | Full backend suite: 76 passed on isolated PostgreSQL. Frontend production build passed. Local migration and manual browser acceptance remain |
| 5 — Issues | CRUD, type, priority, labels, comments | Ownership and relationships tested |
| 6 — Board | Five columns, status editing and optional drag and drop | Status persists after reload |
| 7 — V1 quality | Error states, accessibility, docs, CI, deployment | Complete V1 journey on deployed app |

After V1: GitHub integration, focused AI assistance, repository indexing/RAG, background jobs, then team collaboration. At each step, review why the code exists, implement one feature, test its meaningful behavior, and update the documentation.

Milestone 4 does not implement the full V1 project CRUD/archive scope. The additive
0003 project migration requires review before application to devpilot.
