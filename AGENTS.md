# Repository agent instructions

## Mandatory UI engineering standard

Before planning, implementing, or reviewing any UI or other user-facing change in this repository, read `docs/DESIGN_ENGINEERING_STANDARD.md` completely and treat it as the definition of done.

Add the relevant checks to the working plan, reuse shared patterns and semantic tokens, and verify rendered states—not only the happy path. A direct user instruction takes precedence when it intentionally differs from the standard; document the exception and preserve accessibility, security, data integrity, and scope isolation.

Backend-only work that cannot affect visible behavior, workflow state, authorization feedback, reporting, or UI-facing contracts does not require the UI standard.
