# Domain docs layout

Layout: single-context

Rules for skills that consume domain documentation:

- `CONTEXT.md` should live at the repository root and contain a concise description of the project's domain language, important domain concepts, common terminology, and any conventions assistants should follow.
- `docs/adr/` should contain architectural decision records describing past decisions, rationale, and links to related code or issues.

Notes for skills:

- Skills such as `improve-codebase-architecture`, `diagnose`, and `tdd` will look for `CONTEXT.md` at the repo root and `docs/adr/` for ADRs.
- For monorepos with multiple contexts, replace this file with a `CONTEXT-MAP.md` at the root that points to per-package `CONTEXT.md` files.
