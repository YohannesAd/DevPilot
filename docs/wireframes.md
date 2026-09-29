# V1 screen plan

| Screen | Key content | Main action |
| --- | --- | --- |
| Register / login | Email, password, validation message | Create account or sign in |
| Project list | Active projects, archive toggle, issue counts | Create project |
| Project overview | Name, description, counts by status, recent issues | Open board or new issue |
| Issue list | Search/filter by status, type, priority | Open or create issue |
| Kanban board | Backlog, Todo, In Progress, Review, Done columns | Move issue to another status |
| Issue detail | Title, description, type, priority, status, labels, assignee, comments | Edit and comment |

Desktop board has five columns with horizontal scrolling when needed. On a narrow screen, provide a status selector or horizontally scrollable columns; drag and drop must not be the only way to update status. Each form shows field errors and keeps entered content after recoverable failures. Archived items remain accessible from an explicit archive view.

## Current signed-in workspace

The screen plan above describes eventual V1. The current milestone includes:

| Screen | Implemented content and action |
| --- | --- |
| / | Public welcome; a valid session redirects to /dashboard |
| /dashboard | Personal greeting, up to four newest active projects, Create project, View all projects |
| /projects | Active/Archived view links, paginated active cards, inline create form |
| /projects?status=archived | Paginated archived cards, archive dates, useful empty state |
| /projects/[id] active | Saved details and dates, Edit project, Archive project, All projects link |
| /projects/[id] archived | Prominent archived state/date, preserved details, Restore, Archived projects link |
| /account | Profile and working logout; workspace navigation |

Signed-in Home and the logo lead to /dashboard. Projects leads to /projects;
My account leads to /account. Navigation wraps on narrow screens. Cards use two
columns on desktop and one on mobile. No issue counts, activity or board
actions are presented. Active empty lists offer Create project and Archived;
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
checks. See README for the remaining acceptance checklist after 0004 approval.
