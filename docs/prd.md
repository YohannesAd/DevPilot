# DevPilot V1 product requirements

## Problem and audience

Individual developers track project work across notes and code hosting, which makes it hard to see what needs doing and what has been completed. DevPilot V1 provides one private workspace for software project planning. The primary user is a student or independent developer managing several projects. V1 is useful without GitHub or AI connections.

## Scope

| Area | Required behavior |
| --- | --- |
| Accounts | Register, log in, log out, view profile, protect private data |
| Projects | Create, list, edit, archive, restore, view dashboard |
| Issues | Create, edit, archive; classify as bug, feature, or task; set priority and status |
| Organization | Add project labels, optionally assign an issue to its owner, add and read comments |
| Workflow | View five status columns, change status, persist changes across refresh |

The statuses are Backlog, Todo, In Progress, Review, and Done. Priorities are Low, Medium, High, and Urgent. V1 has one owner per project; assigning an issue means assigning it to that owner or leaving it unassigned. Multiuser assignment is deferred until project membership exists.

## Main journey and acceptance criteria

1. A new user registers and signs in.
2. They create a project and several issues of different types and priorities.
3. They filter and view issues on the project page and board, move them between columns, and add comments.
4. They sign out and sign back in; the project, issues, statuses, and comments remain.
5. A second account cannot access the first account's project or related issues, even by calling the API directly.

Project archival hides it from the active list but preserves its issues and comments. Issue archival similarly preserves history. The basic dashboard shows open and completed issue counts, plus counts by status. No deadline, notification, or analytics promise is part of V1.

## Quality requirements

Passwords are hashed with a modern password hasher. Session credentials use HttpOnly cookies. All project, issue, comment, and label requests enforce owner access on the server. Inputs are validated; errors follow one JSON shape. Database constraints preserve relationships. Add focused API tests for authentication, data ownership, and workflow persistence as those features are built. Provide migrations and a repeatable local setup.

## Deferred

GitHub OAuth/API/webhooks, branches, commits, pull requests, AI, RAG, embeddings, pgvector, Redis, workers, organizations, roles, invitations, notifications, real-time updates, and advanced analytics. These belong to later milestones rather than V1 acceptance.

## Implemented Projects milestone

The first signed-in workspace supports creating, listing, and opening private
projects. A project has a required name (1-100 characters after trimming) and an
optional description (up to 2,000 characters). An empty workspace leads directly
to Create project. Saved projects survive refresh, logout, and subsequent login.
Only the owner can list or retrieve them, including through direct API calls.

Project management now implements editing, archiving, and restoring. Archived
projects leave active lists/dashboard, remain readable by their owner, and appear
in an explicit Archived view. Restore is required before editing and returns them
to active lists. Archive confirmation explains that data is preserved. Repeated
archive/restore requests are safe no-ops. Partial edits preserve omitted fields;
an explicit null description clears it. Forms retain edits after recoverable errors.

Project migrations through 0004 are already applied to local devpilot.
Isolated backend tests and production build passed;
browser acceptance remains unverified because no browser was connected.
Labels, comments, assignment, issue archival/deletion, and issue counts
remain future V1 work. No placeholder activity or statistics are shown.

## Implemented core issues milestone

Owners can create, list, open, edit, and change status on issues in their active
projects. Title is trimmed and required (1–200 characters); description is optional
plain text up to 10,000 characters. Types: Task, Bug, Feature. The existing V1
statuses and priorities above are preserved, including Backlog, Review, and Urgent.
Defaults are Task, Todo, Medium. Issues have UUIDs, project relationships, and
creation/update timestamps; lists use bounded newest-first pagination.

Project archival preserves issue data. Owners can still read archived projects'
issues, but must restore the project before creating/editing/changing status.
Other accounts cannot access issues, even by direct ID or a mismatched project URL.
Changes persist across new requests and sign-out/sign-in. Forms preserve drafts
after recoverable failures; no draft is stored in browser storage.

Migration 0005 is tested in isolation and approved/applied to local
devpilot. The user subsequently confirmed real-browser issue functionality.
Board-specific browser checks remain separate; HTTP-client and simulated DOM
checks do not establish browser behavior. Comments, labels, assignment, deletion,
GitHub and AI remain deferred.

## Implemented Kanban milestone

Each project offers List and Board views with explicit active navigation.
The board displays Backlog, Todo, In Progress, Review, Done in that order. Cards
link to details and show title, type, priority and text status. Owners move cards
through a labeled Move to select and confirmation button or desktop dragging.
Saved responses update the board and announce success; failed moves preserve
the confirmed card and explain retry/refresh. Archived boards remain readable
with movement disabled. On mobile a labeled selector navigates columns.

The board loads 100 newest issues per explicit page request, across all statuses,
and offers Load older issues until complete. Partial counts say loaded. There is
no hidden total cap, automatic unbounded fetch, or new manual ordering model.
Refresh and List/Board switching load persisted records; status movement reuses
the authenticated issue update endpoint. Comments, labels, global search,
assignment, GitHub and AI remain out of scope. No migration is required.
