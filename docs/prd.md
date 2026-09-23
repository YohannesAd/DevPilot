# DevPilot V1 product requirements

## Problem and audience

Individual developers track project work across notes and code hosting, which makes it hard to see what needs doing and what has been completed. DevPilot V1 provides one private workspace for software project planning. The primary user is a student or independent developer managing several projects. V1 is useful without GitHub or AI connections.

## Scope

| Area | Required behavior |
| --- | --- |
| Accounts | Register, log in, log out, view profile, protect private data |
| Projects | Create, list, edit, archive, view dashboard |
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
