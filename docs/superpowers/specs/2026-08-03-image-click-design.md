# Design: click-to-enlarge images (lightbox + open-original)

Date: 2026-08-03

## Problem

Images in the rendered markdown are bare `<img>` elements: marked emits them with no
`<a>` wrapper, `setLinkTargets()` only touches `<a>` elements, and CSS only caps
`max-width: 100%`. Clicking an image does nothing. When an image displays too small
(e.g. squeezed by a narrow embed iframe, or constrained by the `=NN%`/`|NNpx` size
syntax), the reader has no way to see it larger.

## Behavior

- Clicking any rendered image opens a fixed, full-viewport overlay showing that image
  at natural resolution, scaled to fit the screen.
- Clicking anywhere in the overlay (image or backdrop) closes it; `Esc` closes it too.
- An "Open original" link inside the overlay opens the raw image file in a new tab
  (`target="_blank"`, `rel="noopener"`). This is the reader's recourse when the source
  image is genuinely low-resolution: the new tab shows it at full resolution and the
  browser's own zoom applies.
- Images the author already wrapped in a link (`[![alt](img)](url)`) are skipped - the
  link keeps its own behavior, matching GitHub.
- No visible caption. The image's alt text is used only as the overlay's `aria-label`.

## Visuals

- The overlay backdrop is theme-aware: it uses the existing CSS variables (`--bg`,
  `--fg`, `--border`) with transparency so it matches the doc in both the light and
  dark Confluence themes.
- Images in the doc gain `cursor: zoom-in` to signal clickability.
- "Open original" is a small link in the corner of the overlay, themed with the same
  variables.

## Implementation

### js/viewer.js

New `enableImageZoom()`, called from `render()` after `rewriteAssetPaths()` (so the
image srcs are already resolved to absolute URLs).

- Query `#content img`; skip any image whose `closest('a')` is non-null.
- Attach a click handler per image that opens the overlay.
- One lazily-created overlay instance is reused across all images. The overlay is a
  `div.mdv-lightbox` appended to `document.body`, containing the `<img>` and the
  "Open original" `<a>`. On open: set `img.src` from `img.currentSrc || img.src` (the
  resolved absolute URL), set `aria-label` from alt, set the open-original href, and
  add an `.open` class. On close: remove `.open` and clear the src.
- A single global `keydown` listener closes the overlay on `Esc` and no-ops when it is
  closed.
- Toggle a `body.mdv-lightbox-open` class while open to lock background scroll
  (standalone use).
- Clicking anywhere on the overlay closes it (the image area included). The
  "Open original" link stops propagation so its click does not close the overlay.

### css/viewer.css

- `.markdown-body img { cursor: zoom-in; }`
- `.mdv-lightbox`: `position: fixed; inset: 0; z-index: 200; display: none;` themed
  backdrop using `--bg`/`--border` at partial opacity; `.mdv-lightbox.open { display:
  flex }` centered.
- `.mdv-lightbox img`: fit-to-screen via `max-width` / `max-height` in `vw`/`vh`,
  `object-fit: contain`.
- `body.mdv-lightbox-open { overflow: hidden; }`
- `.mdv-lightbox-open` (the link): small, positioned in a corner of the overlay,
  themed with `--fg`/`--bg`.

### test/image-zoom.test.js (new)

Follows the existing harness pattern (`boot()` from `test/harness.js`, asserts on
`h.d` / `h.w`):

- Clicking a plain image opens the overlay (`.open` present) with `src` matching the
  image's resolved src.
- `Esc` closes the overlay.
- Backdrop click closes the overlay.
- The open-original link has `target="_blank"` and `href` equal to the image's
  resolved src.
- An image already inside a link does not open the overlay on click.

## Known limitation

The overlay lives inside the iframe, so in the Confluence embed it covers only the
iframe's area, not the whole page. Making it page-level would require cooperation from
the parent Confluence page and is out of scope.

## Out of scope

- Zoom controls / pinch-to-zoom beyond 100%.
- Page-level (cross-iframe) lightbox.
- Caption display.
