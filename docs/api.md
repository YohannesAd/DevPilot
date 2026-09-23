# V1 REST API sketch

All routes use `/api`. Request and response bodies are JSON. IDs are UUIDs. Protected endpoints require the session cookie. The authenticated user is inferred from the cookie, never accepted as an owner ID in request JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check API availability; implemented in milestone 1 |
| POST | `/api/auth/register` | Register account; implemented |
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

## Registration (implemented)

`POST /api/auth/register` accepts a JSON object with exactly these required fields:

| Field | Validation |
| --- | --- |
| `email` | Valid email address, maximum 254 characters; validated/normalized by Pydantic EmailStr (including surrounding whitespace removal and domain normalization). No mailbox ownership or deliverability check. |
| `display_name` | String, 1–100 characters after trimming surrounding whitespace. |
| `password` | String, 12–128 characters inclusive; never trimmed or normalized. No character-class requirement. |

Non-string values, missing fields, and extra fields are rejected. The email limit
is intentionally narrower than the database's 320-character column. Passwords
are stored only as salted Argon2id hashes using argon2-cffi's default cost settings
([hasher reference](https://argon2-cffi.readthedocs.io/en/stable/api.html)).

Example request (use a disposable password for manual testing):

```json
{
  "email": "registration-check@example.com",
  "display_name": "Registration Check",
  "password": "Local-test-password-2026!"
}
```

Success is HTTP **201**, with only these public user fields:

```json
{
  "id": "82a7c738-b86e-47e4-8a73-ff3a08e69cdd",
  "email": "registration-check@example.com",
  "display_name": "Registration Check",
  "created_at": "2026-09-23T15:00:00Z",
  "updated_at": "2026-09-23T15:00:00Z"
}
```

The ID and timestamps above are illustrative. Neither `password` nor
`password_hash` is returned. Registration creates no authentication session or cookie.

An email already registered in any capitalization returns HTTP **409**:

```json
{"error":{"code":"email_already_registered","message":"An account with this email already exists."}}
```

The database's unique `lower(email)` index enforces this, including concurrent
registration attempts. The failed database transaction is rolled back before
returning the controlled response. Other database integrity failures are not
misreported as duplicate emails.

Invalid input or malformed JSON returns HTTP **422**:

```json
{"error":{"code":"validation_error","message":"Request body does not match the required schema."}}
```

Validation errors deliberately omit input values, including passwords. Only the
health and registration routes are currently implemented; the other routes above
remain planned.
