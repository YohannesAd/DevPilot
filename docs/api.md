# V1 REST API sketch

All routes use `/api`. Request and response bodies are JSON. IDs are UUIDs. Protected endpoints require the session cookie. The authenticated user is inferred from the cookie, never accepted as an owner ID in request JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check API availability; implemented in milestone 1 |
| POST | `/api/auth/register` | Register account |
| POST | `/api/auth/login` | Start session |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/users/me` | View profile |
| GET, POST | `/api/projects` | List active projects, create project |
| GET, PATCH | `/api/projects/{project_id}` | Read or edit project; PATCH can archive |
| GET, POST | `/api/projects/{project_id}/issues` | List or create issues |
| GET, PATCH | `/api/projects/{project_id}/issues/{issue_id}` | Read or edit an issue; PATCH can archive |
| GET, POST | `/api/projects/{project_id}/labels` | List or create project labels |
| GET, POST | `/api/projects/{project_id}/issues/{issue_id}/comments` | List or create comments |
| GET | `/api/projects/{project_id}/summary` | Dashboard status counts |

Issue PATCH accepts fields such as `status`, `priority`, and `assignee_id`. Board drag and drop uses the same PATCH operation as a status dropdown. List endpoints will take bounded pagination and optional status/type filters. Exact payload examples and OpenAPI schemas are added alongside each implemented feature, so the document stays consistent with working behavior.
