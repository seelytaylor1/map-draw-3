# Prototypes

These directories are deliberately opt-in experiments. They are not imported by the production app entry point, are not part of the mission-first generation pipeline, and are not included in the normal Vitest glob.

Run them only through their named package scripts while evaluating a design. Once a direction is adopted, move the smallest useful implementation into `src/` and remove the experiment rather than making production code depend on it.
