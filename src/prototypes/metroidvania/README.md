# Metroidvania generation lab

Throwaway UI and logic prototype for the question:

> Which generation model makes an unexplored dungeon feel like a set of gameplay promises rather than a random room graph?

Run the isolated lab with `npm run prototype:metroidvania`, then open the URL it prints. The bottom dock switches between three deliberately different hypotheses:

- `01 Critical Spine` — a critical route with intentional backtrack rewards.
- `02 Central Hub` — a radial dungeon where locks are visible before they are solvable.
- `03 Branch-and-merge` — an ecology-first layout with fog of war and emergent loops.

The prototype keeps the semantic checks visible: goal reachability, loop count, and lock/key coverage. It is intentionally not production generation code; capture the preferred model before deleting or absorbing it.

## Vertical slice

Prototype 01 is the selected slice. Click `Begin exploration`, then play the room graph directly from the inspector. Locked connections record a failed attempt without moving you; ability rooms add Dash, Claw, and Lantern to the inventory; shortcut traversal is counted separately; reaching the Heart completes the run. The success banner reports whether both backtrack shortcuts were exercised.
