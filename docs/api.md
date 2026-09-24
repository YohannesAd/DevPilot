# V1 REST API sketch

All routes use `/api`. Request and response bodies are JSON. IDs are UUIDs. Protected endpoints require the session cookie. The authenticated user is inferred from the cookie, never accepted as an owner ID in request JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check API availability; implemented in milestone 1 |
| POST | `/api/auth/register` | Register account; implemented |
| POST | `/api/auth/login` | Start persistent session; implemented |
| POST | `/api/auth/logout` | Revoke current session; implemented |
| GET | `/api/users/me` | View current public profile; implemented |
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

Validation errors deliberately omit input values, including passwords.

## Login, current user and logout (implemented)

All unsafe requests (anything other than GET, HEAD, OPTIONS), including register,
login and logout, require one exact trusted `Origin` header. Defaults are
`http://localhost:3000` (frontend) and `http://localhost:8000` (API/Swagger).
Missing, `null`, duplicate or untrusted origins return **403** before any write:

```json
{"error":{"code":"csrf_failed","message":"A trusted Origin header is required."}}
```

There is no Referer fallback. CLI clients must explicitly send the trusted Origin.
Browsers supply it automatically for these requests. CORS allows credentials from
the one configured frontend origin; it is not itself the CSRF check.

`POST /api/auth/login` requires exactly `email` and `password`. Email validation
matches registration and lookup ignores case. Password is a string of 1–128
characters, unchanged; registration's minimum of 12 applies to creating passwords.
Invalid schema returns the same sanitized **422** envelope as registration.

```json
{"email":"registration-check@example.com","password":"Local-test-password-2026!"}
```

Successful login returns **200** with the same five public user fields as
registration (`id`, `email`, `display_name`, `created_at`, `updated_at`) and sets
`devpilot_session`. This is an opaque, unpredictable token, not a user ID or JWT.
The cookie is host-only (no Domain), Path `/`, HttpOnly, SameSite=Lax, and has
Max-Age 604800 plus Expires. It is Secure in production, and not Secure for local
HTTP development. Sessions have a fixed seven-day lifetime, without sliding
renewal. A successful re-login creates a new token and revokes the cookie's old
session, if present; other devices' sessions remain active.

Unknown email and incorrect password both return **401**, with no new cookie:

```json
{"error":{"code":"invalid_credentials","message":"Invalid email or password."}}
```

`GET /api/users/me` takes no user ID. It resolves the cookie against PostgreSQL and
returns **200** with only the current user's five public fields. Missing, malformed,
unknown, expired or revoked session tokens return **401**:

```json
{"error":{"code":"authentication_required","message":"A valid session is required."}}
```

`POST /api/auth/logout` requires both a trusted Origin and a valid session cookie.
It revokes only that session, clears the cookie using matching attributes, and
returns **204** with no body. Replaying the old token returns 401. Logout with no
valid session also returns 401; a failed CSRF check returns 403 without revocation.
Auth and current-user responses carry `Cache-Control: no-store`.

Use `http://localhost:3000` and `http://localhost:8000` together locally; do not mix
`localhost` and `127.0.0.1` for browser URLs. PostgreSQL can still use `127.0.0.1`.
Frontend fetch calls use `credentials: "include"` on login, current-user lookup
and logout. The `/register`, `/login` and `/account` frontend pages consume these
endpoints; successful registration leads to login rather than creating a session.
