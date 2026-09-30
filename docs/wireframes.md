# V1 screen plan

| Screen | Key content | Main action |
| --- | --- | --- |
| Register / login | Email, password, validation message | Create account or sign in |
| Project list | Active projects, archive toggle, issue counts | Create project |
| Project overview | Name, description, counts by status, recent issues | Open board or new issue |
| Issue list | Title search and status, type, priority, label filters | Open or create issue |
| Kanban board | Backlog, Todo, In Progress, Review, Done columns | Move issue to another status |
| Issue detail | Title, description, type, priority, status, labels, assignee, comments | Edit and comment |

Desktop board has five columns with horizontal scrolling when needed. On a narrow screen, provide a status selector or horizontally scrollable columns; drag and drop must not be the only way to update status. Each form shows field errors and keeps entered content after recoverable failures. Archived items remain accessible from an explicit archive view.

## Current signed-in workspace

The screen plan above describes eventual V1. The current milestone includes:

| Screen | Implemented content and action |
| --- | --- |
| / | Public welcome; a valid session redirects to /dashboard |
| /dashboard | Personal greeting, active project/issue totals, five status counts, six recently updated issues, four recently updated active projects, Create project, View all projects |
| /projects | Active/Archived view links, paginated active cards, inline create form |
| /projects?status=archived | Paginated archived cards, archive dates, useful empty state |
| /projects/[id] active | Saved project details, edit/archive, List/Board navigation, paginated issue list, Create issue form |
| /projects/[id]?view=board | Five status columns, paged loading, Move to controls, desktop dragging; read-only while archived |
| /projects/[id] archived | Prominent archived state/date, preserved project and issue details, Restore; no issue creation |
| /projects/[id]/issues/[issueId] | Saved issue title/description, text type/status/priority, dates, Back to project, Edit issue for active projects |
| /account | Profile and working logout; workspace navigation |

Signed-in Home and the logo lead to /dashboard. Projects leads to /projects;
My account leads to /account. Navigation wraps on narrow screens. Cards use two
columns on desktop and one on mobile. Dashboard issue counts are implemented; historical activity remains deferred. Active empty lists offer Create project and Archived;
archived empty lists explain preservation and link back to Active. Loading, recoverable
errors with retry, validation errors, and inaccessible projects have explicit states.
Forms have visible labels and focus indicators and retain input after API failures.
A 401 on a private page goes to login with a safe return destination; refresh
refetches the authenticated user's data from the API.

Edit is an inline form prefilled from saved data, with Save changes and Cancel.
Saved details remain visible below the form. Saving disables controls; errors
focus the message and retain entered values. Success closes the editor and
announces saved changes; Cancel returns focus to the project heading.

Archive opens a native modal explaining that the project leaves active lists but
its data is preserved and it can be restored. Initial focus is Keep active;
Tab stays within the modal, Escape cancels when idle, and closing restores focus
to the opener if it remains. Success focuses the confirmation message. Pending
requests disable duplicate submission and cancellation. Failed requests keep the
dialog open with an alert and retry action. Restore is available only in the
archived state and displays progress, failure, and saved-state success feedback.

Layouts use the existing tokens/CSS Modules, wrap actions, and constrain modal
width/height for small screens. These are implemented behaviors, not verified
browser results: no browser was connected for desktop/mobile, keyboard, or visual
checks. Migration 0004 is now applied; see README for the issue acceptance
checklist; 0005 is now approved and applied.

## Core issue flow

The issue list sits beneath saved project details. Cards show the real title,
Type, Status, Priority, and creation date. Newest issues appear first; Previous
and Next page through twenty at a time. An empty active project offers Create
issue; an archived empty project explains that restoration is required. Archived
issues remain linked/readable. Loading and retryable errors are explicit.

Create issue opens an inline form with a required title, optional plain-text
description, and labeled native Type/Status/Priority selects. Defaults are Task,
Todo, Medium; options include all five documented statuses and four priorities.
The first field receives focus. The create action stays disabled while saving
and navigating to the saved issue to prevent duplicate submission. An uncertain
create failure explains that the user should check the list before retrying.

Issue detail has an Edit issue action for active projects. Editing starts with
saved values; status changes use the same form and Save changes button. Recoverable
errors preserve all form values and focus a visible alert. Success renders the
returned record with a focused status message. Cancel returns focus to the issue
heading. Archived issue details show a read-only notice and link to the project's
Restore action. A stale editor receiving 409 preserves its input and explains
that restoration is required.

Controls wrap/stack at the existing mobile breakpoint; long titles/descriptions
wrap and descriptions preserve line breaks without interpreting markup. Status
is always text, not color alone. Existing focus outlines and native keyboard
controls are retained. Comment/label controls are described below; assignment and
issue deletion remain deferred. Shared List/Board filters and dashboard issue counts are now implemented.

## Implemented board flow

Below project details, List and Board links show the active view. Board uses
`/projects/[id]?view=board`, preserving the view across refresh and login. Desktop
shows five columns in documented order with horizontal scrolling as needed.
Each card has a linked title, text type/priority/status, a labeled Move to select,
and a Move button. Native desktop dragging drops into another status column;
the card remains in its original column until the saved response arrives.

During a request, movement/loading controls are disabled to prevent conflicting
updates. Success is announced and focus moves to the saved card's detail link.
Errors are announced and keep the current card and chosen target. Archived
boards explain restoration and disable selects, move buttons and dragging.

At 640px and below, Show column selects one visible column. A successful move
selects its destination column and focuses that card. Dragging is never required.
Each empty column distinguishes no loaded cards from a fully loaded empty status.
The toolbar has Refresh board. Below the columns, Load older issues remains until
all pages are loaded; displayed counts explicitly refer to loaded cards.

The user confirmed the earlier real-browser issue functionality. This board's
desktop/mobile layout, drag feedback and actual keyboard focus still require
browser acceptance; simulated events do not constitute browser verification.

## Comments and labels flow

Project navigation now includes List, Board, Labels. The Labels view is
`/projects/[id]?view=labels`. It has a name field, named color selector, alphabetic
20-item pages, edit actions and confirmed deletion. The dialog explicitly says
all assignments are removed and issues preserved. Archived projects show names
and pages without mutation forms. List/Board layouts and paging remain intact.

Issue details show assigned name badges, Remove actions, a paged project-label
picker, and a Manage project labels link. Mutations are confirmed before badges
change; section-level status/error text communicates the result. All palette
foreground/background pairs have measured contrast above 7.9:1; names convey
meaning independently of color. Controls wrap on narrow screens.

Below labels, Comments contains a labeled plain-text textarea and oldest-first
20-item pages. Each item shows author, creation time and Edited when applicable.
Only own-author items offer Edit/Delete. Edit starts with saved text. Delete
uses a native confirmation dialog, initially focused on Keep comment; failures
stay in the dialog and success focuses the comments heading. Drafts remain after
recoverable errors, and Refresh comments fetches only that section. New comments
are at the chronological end; feedback directs users to Newer comments as needed.
Older comments always remain accessible via paging. Archived comments are read-only.

Real Chrome/Edge desktop/mobile, keyboard, focus and screen-reader checks remain
manual; the implemented flows have simulated DOM and isolated API coverage.

## Filtering and dashboard screens

Above List/Board: visible Status, Priority, Type, Label and Search issue titles
labels, Apply filters button and Clear filters link. Desktop controls use a grid;
small screens stack them. Label choices have Previous/More controls (20 per page).
An off-page selected label remains selected. Help text explains AND matching and
whole-project title search. URL parameters are status, priority, type, label_id,
q and view=board; List is the default. View links retain filters (including a
round trip through Labels). Apply creates a browser history entry; refresh,
Back/Forward and copied links restore the controls and start pagination at zero.
No matching issues offers change/clear guidance; No issues yet offers creation.
Invalid queries remain visible with a correction/clear path. Archived work is
filterable and readable, while creation and board movement remain disabled.

The dashboard shows Active projects and Issues in active projects, followed by
Backlog/Todo/In Progress/Review/Done counts as text. Scope copy explicitly excludes
archived projects and includes Done. Recent issue links show project, title,
status/type/priority and update time; recent project links show name, description
and project update time. Refresh dashboard loads current values. Loading and
retry replace failed content; no active projects offers Create project and
Archived. No fabricated charts, trends or activity feed are displayed.
