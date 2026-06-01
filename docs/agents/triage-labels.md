# Triage labels

This document maps the `triage` skill's canonical roles to the label/state strings used in this repository's issue tracker.

Canonical roles and repository mappings (defaults in use):

- needs-triage: `needs-triage`
- needs-info: `needs-info`
- ready-for-agent: `ready-for-agent`
- ready-for-human: `ready-for-human`
- wontfix: `wontfix`

Notes for skills:

- When processing an issue, the `triage` skill will set the `status` frontmatter to one of the mapped strings above.
- If you later decide to use an external tracker (GitHub/GitLab), update this file with the exact label names used there so the skill applies the correct labels instead of creating duplicates.
