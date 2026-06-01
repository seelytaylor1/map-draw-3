# Issue tracker

This repository uses a local-markdown issue tracker. Issues are stored as markdown files beneath the `.scratch/` directory in this repository.

Recommended layout:

- `.scratch/<feature>/0001-title.md` — individual issue file. Use a numeric prefix or UUID to avoid name collisions.
- Each issue file should contain a YAML frontmatter block with at least `title`, `created`, and `status` fields, followed by a short description and discussion.

Example issue file:

---
title: Fix broken legend rendering
created: 2026-05-31
status: needs-triage
---

Describe the problem, reproduction steps, and any context or links.

Notes for skills:

- The `to-issues` and `triage` skills will create and update markdown files under `.scratch/` rather than calling external issue-tracker CLIs.
- Label/state changes are represented by the `status` field in the frontmatter and by updating the filename or folder as needed.
