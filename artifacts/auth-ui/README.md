# Authentication UI review

Open `index.html` for the four-page screenshot gallery. Each page was captured in
Microsoft Edge at desktop (1440 × 1000 viewport) and mobile (390 × 844 viewport)
widths using full-page screenshots. Additional `success-*` and `error-*` images
show the form feedback states.

The screenshots use controlled API responses and the fictional Alex Morgan
account. No development database records or sessions were changed. The actual
frontend uses the existing API with `credentials: "include"`.

Validation completed:

- Production Next.js build and TypeScript checking.
- Eight page/viewport combinations with no horizontal page overflow.
- Axe WCAG 2 A/AA and 2.1 AA checks: zero detected violations (see `checks.json`).
- Registration validation and first-invalid-field focus.
- Loading/disabled submit state and successful registration redirect.
- Login error announcement/focus and successful login redirect.
- Logout and unauthenticated account redirect.

Automated accessibility checks supplement visual and keyboard checks; they do
not establish complete accessibility conformance.
