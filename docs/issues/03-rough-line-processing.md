# Issue 03: Rough-line post-processing

**Type:** AFK
**Blocked by:** Issue 01 (organic hatch geometry)

## Parent

[prd-hatching-shadow.md](../prd-hatching-shadow.md)

## What to build

Add a post-processing pipeline that converts the clean hatch segments from `buildHatchLines` into wobbly, gappy, hand-drawn-looking lines. This mirrors Dungeon Scrawl's `convertSegment` / `hatchlineRoughOptions` system.

The pipeline is a single pure function `roughenSegments` that takes an array of polylines and returns a new array of polylines with noise and gaps applied. `drawHatching` calls it after `buildHatchLines` before drawing.

**Pipeline stages (in order):**

1. **`shiftSegment(p1, p2, opts)`** — randomly splits a segment into two offset halves at a random interior point. Gives the occasional "broken stroke" look. Controlled by `shiftRate` (probability) and `shiftAmount`.

2. **`subdivide(segments, minLen, maxLen)`** — splits each segment into sub-segments of random length in `[minLen, maxLen]`. This is required for later stages to have enough points to displace.

3. **`scribble(points, scale, amplitude)`** — displaces each point perpendicular to the segment direction by a Perlin-noise amount. Gives organic wobble. A simple 1D value-noise implementation is sufficient (no dependency on a noise library needed).

4. **`addBlemishes(points, noiseScale, amplitude, shift)`** — adds a slow-wavelength lateral drift using a separate low-frequency noise pass. Gives the slight overall curvature of a real pen stroke.

5. **`addSkips(polylines, skipRate, noDotRate)`** — randomly removes sub-segments from each polyline (producing gaps). Occasionally replaces a removed segment with two isolated endpoint "dots" (`noDotRate` controls this). Outputs an array of shorter sub-polylines.

**Signature:**

```ts
roughenSegments(
  segments: [number, number][][],
  opts: RoughLineOptions
): [number, number][][]
```

**Default options** (matching DS `hatchlineRoughOptions`):
```ts
{
  segmentSizeMin: 1,
  segmentSizeMax: 1,
  segmentSkipRate: 0,
  noDotRate: 0.2,
  scribbleScale: 0.2,
  scribbleAmplitude: 1,
  shiftRate: 0,
  shiftAmountMin: 1,
  shiftAmountMax: 2,
  majorNoiseScale: 0.05,
  majorNoiseAmplitude: 0,
  majorNoiseShift: 0.9,
}
```

With these defaults the effect is subtle — slight wobble, occasional micro-dots — which is correct for the Pen & Ink style.

**Tests:** Snapshot test comparing rough vs clean rendering of the same 3×3 center-floor grid. Assert that the rough snapshot differs from the clean baseline (i.e., `roughenSegments` has a measurable visual effect). Also unit-test `roughenSegments` as a pure function: given a straight segment, output polylines should deviate from the original line direction.

## Acceptance criteria

- [ ] `roughenSegments` is a pure function: deterministic given the same input and RNG seed
- [ ] Hatch lines in the running app are visually wobbly/broken compared to the pre-roughness baseline
- [ ] All five pipeline stages are implemented and applied in order
- [ ] Default options produce a subtle effect (not wild distortion) matching the DS Pen & Ink look
- [ ] Snapshot test confirms rough rendering differs from clean baseline
- [ ] Unit tests for `roughenSegments` pass on straight-segment inputs
