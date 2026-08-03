# Click-to-Enlarge Images (Lightbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rendered images clickable: a click opens a full-viewport lightbox showing the image at natural resolution (fit to screen), closed by a click anywhere or Esc, with an "Open original" link that opens the raw file in a new tab.

**Architecture:** A single lazily-created `.mdv-lightbox` overlay on `document.body`, shared across all images. `enableImageZoom()` (called from `render()`, after asset paths are rewritten) attaches a click handler to every image in `#content` that is not already inside an `<a>`. The overlay reuses the theme's CSS variables for a theme-aware backdrop. Tests boot the real viewer via the existing jsdom harness.

**Tech Stack:** Plain ES5 JavaScript (no build step), vanilla CSS, `node:test` + jsdom via `test/harness.js`.

## Global Constraints

- Match the existing ES5 style in `js/viewer.js`: `var`, `function` declarations, `'use strict'`, no arrows/classes/template literals.
- No new dependencies (the deployed viewer stays a static site with no build step).
- Overlay backdrop is theme-aware (uses `--bg` / `--fg` / `--border` / `--link` CSS variables), not a hardcoded dark color.
- No visible caption; alt text flows only into `aria-label`.
- Test command is `npm test` (runs `node --test "test/*.test.js"`). Follow the harness pattern from `test/harness.js` (assert on `h.d` / `h.w`).

---

### Task 1: Lightbox JS + tests

**Files:**
- Create: `test/image-zoom.test.js`
- Modify: `js/viewer.js` (insert a new "image lightbox" section; add one call in `render()`)

**Interfaces:**
- Consumes: `render()` (already calls `rewriteAssetPaths()` before this runs), the harness `boot({ markdown })` from `test/harness.js`.
- Produces: `enableImageZoom()` — attaches per-image click handlers; `openLightbox(img)` / `closeLightbox()` — open/close the shared overlay; a `div.mdv-lightbox` (class `.open` when shown) containing `.mdv-lightbox-img` and `.mdv-lightbox-link`. The overlay lives on `document.body`. `body` gains class `mdv-lightbox-open` while open.

- [ ] **Step 1: Write the failing test**

Create `test/image-zoom.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const pressEscape = (h) => {
  h.d.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};
const overlay = (h) => h.d.querySelector('.mdv-lightbox');

test('clicking an image opens the lightbox with the resolved src', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  assert.ok(overlay(h) && overlay(h).classList.contains('open'), 'lightbox is open');
  assert.equal(overlay(h).querySelector('.mdv-lightbox-img').getAttribute('src'),
    h.d.querySelector('#content img').src);
});

test('Escape closes the lightbox', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  pressEscape(h);
  assert.ok(!overlay(h).classList.contains('open'));
});

test('clicking the overlay closes it', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  overlay(h).click();
  assert.ok(!overlay(h).classList.contains('open'));
});

test('open-original link targets _blank and points at the resolved src', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  const a = overlay(h).querySelector('.mdv-lightbox-link');
  assert.equal(a.target, '_blank');
  assert.equal(a.getAttribute('href'), h.d.querySelector('#content img').src);
});

test('an image inside a link does not open the lightbox', async () => {
  const h = await boot({ markdown: '[![a](img.png)](http://example.com/x)' });
  h.d.querySelector('#content img').click();
  assert.ok(!overlay(h) || !overlay(h).classList.contains('open'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: `image-zoom.test.js` fails — `AssertionError: lightbox is open` (no `.mdv-lightbox` element exists yet). Other suites still pass.

- [ ] **Step 3: Write minimal implementation**

Insert a new section in `js/viewer.js` immediately after the `copyAnchorLink` function (after the line `  }` that closes `copyAnchorLink`, right before the comment `  /* ---------- relative asset paths ---------- */`):

```js
  /* ---------- image lightbox ---------- */
  /* Images render as bare <img>, so a click does nothing by default. This opens
     a full-viewport overlay showing the image at natural resolution, closed by
     a click anywhere or Esc. The "Open original" link opens the raw file in a
     new tab - the escape hatch for low-res sources. */
  var lightboxEl = null;
  var lightboxOpen = false;

  function openLightbox(img) {
    if (!lightboxEl) {
      lightboxEl = document.createElement('div');
      lightboxEl.className = 'mdv-lightbox';
      lightboxEl.setAttribute('role', 'dialog');
      lightboxEl.setAttribute('aria-modal', 'true');
      var boxImg = document.createElement('img');
      boxImg.className = 'mdv-lightbox-img';
      var openLink = document.createElement('a');
      openLink.className = 'mdv-lightbox-link';
      openLink.textContent = 'Open original';
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      /* the link's click must not bubble up to the overlay's close handler */
      openLink.addEventListener('click', function (e) { e.stopPropagation(); });
      lightboxEl.appendChild(boxImg);
      lightboxEl.appendChild(openLink);
      lightboxEl.addEventListener('click', closeLightbox);
      document.body.appendChild(lightboxEl);
    }
    var src = img.currentSrc || img.src;
    var box = lightboxEl.querySelector('.mdv-lightbox-img');
    box.src = src;
    box.alt = img.alt || '';
    lightboxEl.querySelector('.mdv-lightbox-link').href = src;
    lightboxEl.setAttribute('aria-label', 'Image: ' + (img.alt || src));
    lightboxEl.classList.add('open');
    document.body.classList.add('mdv-lightbox-open');
    lightboxOpen = true;
  }

  function closeLightbox() {
    if (!lightboxOpen) return;
    lightboxOpen = false;
    lightboxEl.querySelector('.mdv-lightbox-img').src = '';
    lightboxEl.classList.remove('open');
    document.body.classList.remove('mdv-lightbox-open');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeLightbox();
  });

  function enableImageZoom() {
    contentEl.querySelectorAll('img').forEach(function (img) {
      /* linked images keep the link's own behavior (matches GitHub) */
      if (img.closest('a')) return;
      img.addEventListener('click', function () { openLightbox(img); });
    });
  }
```

Then add one call to `render()`. In `render()` (currently):

```js
    enhanceHeadings();
    setLinkTargets();
    addCopyButtons();
```

change to:

```js
    enhanceHeadings();
    setLinkTargets();
    enableImageZoom();
    addCopyButtons();
```

(`render()` runs `rewriteAssetPaths()` earlier, so `img.currentSrc || img.src` is already the resolved absolute URL, which is also what the open-original link needs.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all suites pass, including all 5 `image-zoom.test.js` tests.

- [ ] **Step 5: Commit**

```bash
git add js/viewer.js test/image-zoom.test.js
git commit -m "feat: click an image to enlarge it in a lightbox"
```

---

### Task 2: Lightbox CSS

**Files:**
- Modify: `css/viewer.css`

**Interfaces:**
- Consumes: the `.mdv-lightbox`, `.mdv-lightbox-img`, `.mdv-lightbox-link` elements and the `body.mdv-lightbox-open` class produced by Task 1; the theme variables `--bg`, `--fg`, `--border`, `--link` set by `apply()` in `js/viewer.js`.
- Produces: the overlay's visual styling. No new class names.

- [ ] **Step 1: Make images signal clickability**

In `css/viewer.css`, line 82, change:

```css
.markdown-body img { max-width: 100%; }
```

to:

```css
.markdown-body img { max-width: 100%; cursor: zoom-in; }
```

- [ ] **Step 2: Add the overlay styles**

Append a new section after the mermaid block (after line 250, the closing `}` of `.markdown-body .mermaid-error`, before the `/* ---------- theme toggle ---------- */` comment):

```css
/* ---------- image lightbox ---------- */
.mdv-lightbox {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: none;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg) 90%, transparent);
}
.mdv-lightbox.open { display: flex; }
.mdv-lightbox-img {
  max-width: 92vw;
  max-height: 86vh;
  object-fit: contain;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}
.mdv-lightbox-link {
  position: absolute;
  bottom: 12px;
  right: 16px;
  font: inherit;
  font-size: 13px;
  padding: 5px 10px;
  color: var(--link);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
}
.mdv-lightbox-link:hover { text-decoration: underline; }
body.mdv-lightbox-open { overflow: hidden; }
```

- [ ] **Step 3: Verify no regressions and eyeball the overlay**

Run: `npm test` — expected: all suites still pass (CSS is not asserted by the suite).

Manual check: open `theme-feel.html` in a browser, render a doc containing `![a](img.png)` and `![wide|600](img.png)`. Confirm: the cursor is zoom-in over images, clicking opens the overlay fit-to-screen, click-anywhere and Esc close it, and the overlay backdrop reads correctly in both light and dark themes.

- [ ] **Step 4: Commit**

```bash
git add css/viewer.css
git commit -m "style: theme-aware image lightbox overlay"
```

---

## Self-Review Notes

- **Spec coverage:** Behavior (click opens overlay, click-anywhere/Esc close, Open original link, skip linked images, no caption, theme-aware backdrop) → Task 1 + Task 2. Known limitation (iframe-scoped overlay) is accepted, not implemented. Out-of-scope items (zoom controls, cross-iframe, caption) are intentionally absent.
- **Type/name consistency:** `.mdv-lightbox` / `.mdv-lightbox-img` / `.mdv-lightbox-link` / `.mdv-lightbox.open` / `body.mdv-lightbox-open` are used identically in the JS (Task 1), CSS (Task 2), and tests (Task 1). `enableImageZoom()`, `openLightbox(img)`, `closeLightbox()` names match across the `render()` call and the definitions.
