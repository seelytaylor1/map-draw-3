# ADR 0004: Offline-first maps and second-display Player View

## Status

Accepted — 2026-09-22

## Decision

Maps remain local files and exports remain local artifacts. The map file is the sole source of truth; no account, cloud library, share link, public showcase, or live Roll20 synchronization is in scope.

The accepted future integration is a second-display/tabletop Player View. Its first journey is: the GM opens a local map, chooses Player View, and presents a filtered render on a second display. It does not create a network session or a separately editable copy. The GM's local map remains authoritative, and closing either view has no synchronization or conflict behavior.

Player View must work offline. It inherits document layers' visibility and opacity and applies the existing player-safe filtering. Any later multi-window implementation must communicate only with the local application process and must leave map editing under GM control.

The second-display view requires no authentication or network service. The GM's local map file remains the sole source of truth; the presented window is a read-only render with no sync or conflict path. Implementation order is: preserve the existing filtered Player View, add a local second-window presentation, then add only the minimum local controls needed to choose and close that presentation. Cloud libraries, share links, public pages, and live Roll20 sync remain out of scope.

## Consequences

Cloud, public sharing, authentication, remote privacy controls, and live VTT synchronization are explicitly out of scope. This decision enables a future local multi-window Player View implementation issue without adding a backend or changing save ownership. It blocks cloud-library, share-link, public-showcase, and live-Roll20 work unless a later accepted ADR changes scope.
