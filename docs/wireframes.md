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
| /dashboard | Personal greeting, up to four newest saved projects, Create project, View all projects |
| /projects | Paginated project cards and an inline create form with name and optional description |
| /projects/[id] | Saved name and description, creation/update dates, private visibility, All projects link |
| /account | Profile and working logout; workspace navigation |

Signed-in Home and the logo lead to /dashboard. Projects leads to /projects;
My account leads to /account. Navigation wraps on narrow screens. Cards use two
columns on desktop and one on mobile. No issue counts, activity, editing or board
actions are presented. Empty lists offer Create project. Loading, recoverable
errors with retry, validation errors, and inaccessible projects have explicit states.
Forms have visible labels and focus indicators and retain input after API failures.
A 401 on a private page goes to login with a safe return destination; refresh
refetches the authenticated user's data from the API.
