# Room-graph placement prototypes

These are throwaway logic prototypes for one question:

> Given the same semantic loop graph, should rooms be placed with explicit loop lanes or with a general global packing and routing algorithm?

Run both prototypes together with:

```text
npm run prototype:room-layout
```

Prototype A uses deliberate Path A / Path B lanes. Prototype B starts from the same graph, relaxes room rectangles globally, and routes relations around padded room obstacles with A*.

Use the controls shown by the program to compare all six Loop Types and multiple seeds. The code is intentionally temporary and should be deleted or absorbed after the placement model is chosen.

