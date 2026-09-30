# V1 REST API sketch

All routes use `/api`. Request and response bodies are JSON. IDs are UUIDs. Protected endpoints require the session cookie. The authenticated user is inferred from the cookie, never accepted as an owner ID in request JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check API availability; implemented in milestone 1 |
| POST | `/api/auth/register` | Register account; implemented |
| POST | `/api/auth/login` | Start persistent session; implemented |
| POST | `/api/auth/logout` | Revoke current session; implemented |
| GET | `/api/users/me` | View current public profile; implemented |
| GET, POST | `/api/projects` | List own projects, create project; implemented |
| GET | `/api/projects/{project_id}` | Read own project; implemented |
| PATCH | `/api/projects/{project_id}` | Partially edit name/description; implemented |
| POST | `/api/projects/{project_id}/archive` | Archive own project; implemented |
| POST | `/api/projects/{project_id}/restore` | Restore own project; implemented |
| GET, POST | `/api/projects/{project_id}/issues` | List or create issues; implemented |
| GET, PATCH | `/api/projects/{project_id}/issues/{issue_id}` | Read/edit issue fields or status; implemented; no archive/delete |
| GET, POST | `/api/projects/{project_id}/labels` | List or create project labels; implemented in 0006 |
| GET, POST | `/api/projects/{project_id}/issues/{issue_id}/comments` | List or create comments; implemented in 0006 |
| GET | `/api/projects/{project_id}/summary` | Future: dashboard status counts |

Issue PATCH accepts only `title`, `description`, `type`, `status`, and `priority`.
Assignment, issue archival/deletion, and list filters are
deferred. Lists currently support bounded pagination. The exact issue contract is below.

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

## Projects (implemented)

All project endpoints require the existing session. POST and PATCH require the
existing trusted Origin check. CORS allows GET, POST, PATCH, PUT, DELETE from the configured
frontend origin with credentials. All project responses, including errors, use no-store.
The frontend uses credentials: "include" for every request.

POST /api/projects accepts exactly name and optional description. Name is a
strict string, trimmed, 1-100 characters. Description is null or a strict string,
trimmed, up to 2,000 characters; omitted/blank becomes null. Extra fields,
including owner_id, are rejected. Duplicate names are allowed. Success is 201.

Example request: {"name":"Portfolio","description":"A home for my work."}

Public project responses contain exactly id (UUID), name, description (nullable),
created_at, updated_at, and archived_at (nullable UTC timestamp). Ownership is
assigned from the session. Newly created projects have archived_at: null.

GET /api/projects?status=active&limit=20&offset=0 returns 200 with
{"items":[/* public projects */],"has_more":false}. The default limit is 20,
allowed range 1-100; offset defaults to 0 and must be nonnegative. Results are
ordered newest first by created_at then id in both views; restoring does not change
created_at. Status is exactly active (default) or archived. Active returns only
archived_at IS NULL; archived returns only archived_at IS NOT NULL. Invalid status
values return 422. Filtering happens before pagination, including has_more.
Empty results have items: []. Only the current owner's projects are returned,
regardless of extra query fields. Offset pagination is not a snapshot; concurrent
creation, archiving, or restoring can shift page boundaries.

GET /api/projects/{project_id} returns 200 with one public project, including when
archived. Missing and
foreign-owned IDs both return 404 with
{"error":{"code":"project_not_found","message":"Project not found."}}.
Malformed UUIDs, invalid bodies and invalid pagination return the existing 422
validation_error envelope. Invalid sessions return 401; failed Origin checks 403.

### Partial edits

`PATCH /api/projects/{project_id}` accepts at least one of `name` and `description`.
Success returns 200 with the full saved public project.

| Input | Meaning |
| --- | --- |
| Omitted field | Leave that field unchanged |
| name string | Trim, require 1–100 characters |
| name: null, blank, or non-string | 422; no changes saved |
| description string | Trim, maximum 2,000 characters; blank normalizes to null |
| description: null | Clear saved description |
| Empty object or unsupported fields | 422; no changes saved |

For example `{"name":"New name"}` preserves the description;
`{"description":null}` clears only the description. Ownership, IDs, timestamps,
and archive state cannot be patched. A no-op edit leaves updated_at unchanged.
Edits to archived projects return **409**:

```json
{"error":{"code":"project_archived","message":"Restore this project before editing it."}}
```

### Archive and restore

`POST /api/projects/{project_id}/archive` and
`POST /api/projects/{project_id}/restore` each require an empty JSON object `{}`.
Missing/null bodies or unsupported fields return 422. Both return 200 with the
saved public project. Archive sets archived_at to server UTC time; restore clears
it. A real transition updates updated_at, preserving created_at and all other data.
Repeated actions when already in the requested state return the same project,
without changing archived_at or updated_at. There is no hard-delete operation.

Each write first finds the owner-scoped project with a row lock. Concurrent edits
and state transitions are serialized so edits cannot bypass the archived-state
check. Existing session and trusted-Origin rules apply unchanged. Missing or
foreign-owned targets return the same 404, including archive/restore.

Login opens /dashboard or restores an allowlisted private next URL. Projects are
available at /projects and /projects/[id]; the Archived view is
/projects?status=archived. Dashboard/default list request active projects.
Project management uses migration 0004, already applied to local devpilot.
Summary statistics remain unimplemented. Issues require migration 0005,
which is approved, applied, and verified on local devpilot.

## Issues (implemented; local migration 0005 applied)

Every endpoint uses the existing session and verifies ownership of the project in
the URL. No owner or project identifier is accepted in the JSON body. Looking up
an issue requires both its ID and membership in the authorized project; there is
no unscoped `/api/issues/{id}` endpoint. POST and PATCH reuse the trusted-Origin
check and credentialed CORS. Responses, including errors, use no-store.

### Create

`POST /api/projects/{project_id}/issues` returns **201** with the saved issue.

| Field | Rules / default |
| --- | --- |
| title | Required strict string, trimmed, 1–200 Unicode characters |
| description | Optional strict string or null, trimmed, max 10,000 characters; omitted/blank becomes null; plain text |
| type | task (default), bug, feature |
| status | backlog, todo (default), in_progress, review, done |
| priority | low, medium (default), high, urgent |

The five statuses and four priorities preserve the pre-existing PRD/database
contract. Title/description limits and defaults fill previously undefined details.
Duplicate titles are permitted. Unsupported fields (including owner_id,
project_id, id, timestamps, assignee_id, labels, archived_at) are rejected with 422.

```json
{"title":"Fix mobile navigation","description":"Keep the menu usable on small screens.","type":"bug","status":"todo","priority":"high"}
```

Public responses contain exactly `id`, `project_id`, `title`, `description`,
`type`, `status`, `priority`, `created_at`, `updated_at`, and `labels`. Labels are
public label objects sorted by case-insensitive name then ID. IDs are UUIDs; timestamps
are UTC. Description is nullable. Ownership is inherited from the project and is
not returned as a separate owner field.

### List and retrieve

`GET /api/projects/{project_id}/issues?limit=20&offset=0` returns **200**:
`{"items":[/* public issues */],"has_more":false}`. Limit is 1–100, default 20;
offset is nonnegative, default 0. Ordering is `created_at DESC, id DESC`, including
ties. Updates do not change creation order. Offset pagination is not a snapshot;
concurrent creation can move page boundaries. Empty collections have `items: []`.

`GET /api/projects/{project_id}/issues/{issue_id}` returns **200** with one issue.
Archived projects and their issues remain readable by their owner.

### Partial updates and status changes

`PATCH /api/projects/{project_id}/issues/{issue_id}` returns **200** with the saved
issue. At least one allowed field is required. Omitted fields stay unchanged;
explicit null is accepted only for description, where it clears the value. Blank
description also clears it. Empty patches, null title/type/status/priority, invalid
enums, and unsupported fields are rejected atomically with 422. Status is changed
with the same PATCH, e.g. `{"status":"done"}`. A no-op patch preserves updated_at.

An archived parent blocks POST and PATCH with **409 project_archived** using the
existing project error envelope. Restore the project before retrying. Each write
locks and checks the owner-scoped parent row, serializing it with project archival.
An issue is never moved to another project through PATCH.

### Errors

- **401 authentication_required**: missing/expired/revoked session.
- **403 csrf_failed**: untrusted/missing Origin on a write.
- **404 project_not_found**: missing or foreign project, using identical responses.
- **404 issue_not_found**: absent issue or ID not belonging to the authorized project.
- **409 project_archived**: parent is archived; creation/edit/status writes blocked.
- **422 validation_error**: invalid body, UUID, or pagination.

Example issue error: `{"error":{"code":"issue_not_found","message":"Issue not found."}}`.
Validation responses retain the existing sanitized envelope and do not echo input.

## Board client contract (implemented)

No new endpoint: the board requests the existing issue collection with
`limit=100&offset=0`, then increments offset by each returned page length when
the user selects Load older issues. It groups loaded issues into Backlog, Todo,
In Progress, Review, Done, and clearly marks partial counts. `has_more` governs
the next action; all issues are reachable, not just the first list page.
Repeated page IDs are de-duplicated. Refresh restarts at zero; offset paging is
not a concurrent snapshot. List/Board use the same saved records and ordering.

Both desktop dragging and Move to submit only `{"status":"<documented value>"}`
to `PATCH /api/projects/{project_id}/issues/{issue_id}`. Only confirmed responses
move cards. A retry repeats the same desired status safely; a network failure
can mean the write succeeded, so refreshing also reconciles the saved status.
Authentication, exact Origin checks, owner/project scope, and archived 409 rules
are unchanged. A server error retains the generic error envelope and CORS headers.

## Comments and labels (implemented; local 0006 applied)

Every endpoint below authenticates the session and authorizes the parent project.
An issue ID must belong to that same project. Unsafe methods require the exact
trusted Origin, including PUT and DELETE. Archived projects permit reads but
reject every write with 409 project_archived. No owner/author/project identifiers
are accepted in request bodies. Public issue responses now include `labels: []`
or label objects, including list, detail, create and update responses. Labels are
loaded in one batched query per issue page, not once per issue.

### Comments

Base: `/api/projects/{project_id}/issues/{issue_id}/comments`.

| Method/path | Contract |
| --- | --- |
| GET base | 200 `{items, has_more}`; limit 1–100 (default 20), offset >= 0; created_at ASC, id ASC |
| POST base | Strict `{body}`: trimmed plain text, 1–5,000 characters; 201 public comment |
| GET base/{comment_id} | 200 public comment, scoped to parent issue/project |
| PATCH base/{comment_id} | Strict `{body}`, same validation; own-author only; 200 saved comment |
| DELETE base/{comment_id} | Own-author only; 204; repeat/missing ID returns 404 comment_not_found |

Public comment: `id`, `issue_id`, `body`, `author: {id, display_name}`,
`created_at`, `updated_at`, `edited`. No email or credential fields are exposed.
The author is always the session user on creation. Edited means updated_at is
later than created_at; repeating the same body is a no-op. Missing/foreign IDs
and attempts to mutate another author's comment return 404 comment_not_found.
POST is not an idempotency endpoint: after an uncertain response, inspect the
comment pages before retrying. Pagination is chronological, oldest first; deletes
may shift offsets, so refresh or page backwards to reconcile concurrent changes.

### Project labels and assignments

Base: `/api/projects/{project_id}/labels`.

| Method/path | Contract |
| --- | --- |
| GET base | 200 `{items, has_more}`; limit 1–100 (default 20), offset >= 0; lower(name) ASC, id ASC |
| POST base | Strict `{name, color?}`; 201 public label |
| GET base/{label_id} | 200 public label scoped to this project |
| PATCH base/{label_id} | Nonempty partial `{name?, color?}`; omitted unchanged, explicit null forbidden; 200 saved label |
| DELETE base/{label_id} | 204; removes label and all assignments, preserves issues; repeat/missing ID returns 404 |

Name: trimmed 1–30 characters, unique within the project ignoring case using
PostgreSQL lower(name). Color: blue (default), green, amber, purple, rose, slate.
Public label: `id`, `project_id`, `name`, `color`. Renaming/recoloring keeps the ID
and its assignments. Duplicate name returns 409 label_name_taken; a missing or
other-project label returns 404 label_not_found. Unknown/null fields and invalid
colors/text return the established 422 validation_error, without echoing input.

`PUT /api/projects/{project_id}/issues/{issue_id}/labels/{label_id}` assigns a
label; `DELETE` at the same path removes that assignment. No body is required.
Both return 200 with the issue's complete saved label array. Repeating either
action is a no-op with the same response. The label must still exist in the same
project (404 otherwise); composite database foreign keys enforce this as well.
Issue title, description, status, creation time and updated_at are not changed by
label assignments. Comments and labels are not writable through issue PATCH.
