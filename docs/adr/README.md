# Architecture Decision Records

Durable design decisions for the karaoke product pipeline (see [../KARAOKE_PRODUCT_ROADMAP.md](../KARAOKE_PRODUCT_ROADMAP.md)).
Each ADR records *why*, so future sessions (any model, any account) inherit the reasoning instead of re-deriving it.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-rendering-core-extraction.md) | Extract a DOM-free rendering core from app.js | Accepted |
| [0002](0002-headless-batch-renderer.md) | Headless batch renderer: Puppeteer first, node-canvas if needed | Accepted |
| [0003](0003-auto-alignment-cli.md) | Auto-alignment as a Python CLI port of the proven in-browser algorithm | Superseded in algorithm/QA by 0004 |
| [0004](0004-approved-timing-corpus-alignment.md) | Speaker-calibrated constrained alignment from approved timing pairs | Accepted |

Convention: `Status` is Proposed → Accepted → Superseded-by-NNNN. Never edit an accepted ADR's decision retroactively — write a superseding one.
Source audit baseline: `app.js` @ v1.4.2, 7,763 lines (full read 2026-06-12, Fable 5 session).
