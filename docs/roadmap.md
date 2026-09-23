# Build order and progress

| Milestone | Work | Check |
| --- | --- | --- |
| 0 — Product and design | PRD, architecture, relationships, API sketch, screens | Complete |
| 1 — Local vertical slice | Next.js page fetches FastAPI health route | Implemented; run locally to verify |
| 2 — Persistence | PostgreSQL connection, ORM, Alembic first migration; users foundation implemented | Run migration and SQL persistence checks in README; API reads/writes deferred to account endpoints |
| 3 — Accounts | Register, login, logout, session cookie and authorization tests | Second account cannot read private data |
| 4 — Projects | CRUD, archive, list, dashboard | State persists across refresh |
| 5 — Issues | CRUD, type, priority, labels, comments | Ownership and relationships tested |
| 6 — Board | Five columns, status editing and optional drag and drop | Status persists after reload |
| 7 — V1 quality | Error states, accessibility, docs, CI, deployment | Complete V1 journey on deployed app |

After V1: GitHub integration, focused AI assistance, repository indexing/RAG, background jobs, then team collaboration. At each step, review why the code exists, implement one feature, test its meaningful behavior, and update the documentation.
