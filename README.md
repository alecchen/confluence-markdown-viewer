# Confluence Markdown Viewer

A static, reusable Markdown viewer for embedding in Confluence. Markdown stays the single source of truth in Git; this repo is only the renderer.

- No build step, no npm — plain static HTML/CSS/JS.
- marked.js + highlight.js from **cdnjs only** (jsDelivr is blocked in the Confluence environment).
- GitHub-flavored Markdown styling, GitHub-style tables.
- Solarized code highlighting.
- Inter for text, JetBrains Mono for code.
- Confluence theme detection (via the embed script) with browser `prefers-color-scheme` fallback.
- Dynamic light/dark switching without reload; manual override persists in localStorage.
- Draft → publish: only `published/` is ever served; drafts never leave a draft repo outside the web root.

## Layout

```
public_html/username/
  viewer/              <- this repo (clone)
    viewer.html        <- the viewer: one reusable page
    css/viewer.css
    js/viewer.js
    published/         <- served markdown (gitignored; plain files, NFS-backed)
    .htaccess          <- deny /.git/ and dotfiles
  drafts/              <- separate git repo, drafts only (outside web root)
```

## Deploy

On the Linux VM, clone into the web root and pull to update:

```sh
cd ~/public_html/username
git clone <this repo URL> viewer
cd viewer && git pull
```

After the first deploy, verify the `.git` deny (see Security).

## Publish workflow

Drafts live in their own git repo at `~/drafts`, outside the served tree. The served
`published/` folder is gitignored here and backed up by NFS snapshots. Publishing is
a pre-commit hook that copies the staged draft into the served tree, so
"commit a draft" = "it is live":

`~/drafts/.git/hooks/pre-commit`:

```sh
#!/bin/sh
set -e
mkdir -p "$HOME/public_html/username/viewer/published"
for f in $(git diff --cached --name-only -- '*.md'); do
  cp "$f" "$HOME/public_html/username/viewer/published/"
done
```

Make it executable (`chmod +x`). Write/edit drafts in VS Code over SSH, preview there,
then `git commit` to publish. The draft repo keeps file history; NFS snapshots are the
rollback for the served copies.

## Embed in Confluence

Paste this into the HTML macro on the target page (change the `?src=` path per doc):

```html
<iframe id="mdv" src="https://people.my_company_url.com/username/viewer/viewer.html?src=published/foo.md"
        scrolling="no" style="width:100%;border:0;display:block;overflow:hidden;"></iframe>
<script>
(function () {
  var f = document.getElementById('mdv');
  var childOrigin = new URL(f.src).origin;   /* derived from the iframe URL, no hardcoding */
  var lastBg = null;

  function luminance(c) {
    var m = c.match(/(\d+(?:\.\d+)?)/g);
    if (!m || m.length < 3) return 255;
    return 0.299 * (+m[0]) + 0.587 * (+m[1]) + 0.114 * (+m[2]);
  }
  function pageBg() {
    var el = document.body;
    while (el) {                              /* walk up past transparent bodies */
      var c = window.getComputedStyle(el).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      el = el.parentElement;
    }
    return null;
  }
  function build() {
    var bg = pageBg();
    var dark = bg ? luminance(bg) < 128 : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var s = window.getComputedStyle(document.body);
    var a = document.body.querySelector('a');
    return {
      type: 'mdv-theme',
      theme: dark ? 'dark' : 'light',
      bg: bg || (dark ? '#1d2125' : '#ffffff'),
      fg: s.color || (dark ? '#b6c2cf' : '#172b4d'),
      link: a ? window.getComputedStyle(a).color : (dark ? '#579dff' : '#0052cc')
    };
  }
  function sendNow() {
    var m = build();
    if (m.bg === lastBg) return;              /* only push on an actual change */
    lastBg = m.bg;
    f.contentWindow.postMessage(m, childOrigin);
  }
  var t = null;
  function schedule() { clearTimeout(t); t = setTimeout(sendNow, 120); }

  sendNow();
  f.addEventListener('load', sendNow);
  /* re-sync live when Confluence toggles its theme */
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true });
  new MutationObserver(schedule).observe(document.body, { attributes: true });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
  setInterval(sendNow, 1500);                 /* safety net for any toggle mechanism */

  window.addEventListener('message', function (e) {
    if (e.origin !== childOrigin) return;
    var d = e.data;
    if (d && d.type === 'mdv-height') f.style.height = d.height + 'px';
  });
})();
</script>
```

The `<script>` is optional but recommended: it matches the rendered doc to the
Confluence page theme (background color, text color, link color), keeps the iframe
exactly as tall as its content (no nested scrollbars), and **re-syncs live when
Confluence toggles between light and dark** — only pushing an update when the page
background actually changes. Origins are derived from the iframe URL and the
referrer, so no hostnames need configuring — only the `src` above must point at your
real viewer URL.

## Theme model

- **Default (B — Confluence):** the embed script reads Confluence's computed
  background/text/link colors and theme, and the viewer applies them. Borders,
  table headers and muted text are derived from the text color by alpha.
- **Optional (A — GitHub):** fixed GitHub palette, enabled per-doc via
  `?preset=github`.
- **Fallback:** if no parent message arrives (viewer opened directly, or testing on
  GitHub Pages), the viewer uses the browser theme with the GitHub palette.
- **Manual override:** the small pill at the top-right cycles auto → light → dark and
  persists in localStorage.
- **Code:** always Solarized; block and inline code colors follow the resolved theme.

## Viewer parameters

- `?src=published/foo.md` — which markdown to render (relative to `viewer.html`;
  same origin, so no CORS).
- `?preset=github` — force the GitHub palette (A) for this doc.
- `?theme=light|dark|auto` — force a theme for this load.

## Origins

No hostnames need configuring. The embed script derives the child origin from the
iframe `src`, and the viewer derives the parent origin from `document.referrer`, so
the theme and height messages are only accepted between the iframe and the page that
hosts it.

## Security

Cloning into the web root exposes `/.git/`. The repo ships an `.htaccess` that 404s
dotfiles, but Apache `userdir` sometimes has `AllowOverride` off. After first deploy,
verify in a browser:

```
https://people.my_company_url.com/username/viewer/.git/config
```

Expected: 404. If you get 200, either ask IT to allow the rule, or deploy via archive
instead of clone (`.git` never lands on disk):

```sh
git archive --format=tar HEAD | tar -x -C ~/public_html/username/viewer
```

Re-run the archive command to update (it replaces file contents).

## Dependencies (cdnjs, pinned)

- marked 12.0.2 — https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js
- highlight.js 11.9.0 — https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js
- Inter + JetBrains Mono via Google Fonts (browser-side). If your network blocks
  Google Fonts, self-host the woff2 files under `css/fonts/` and update `viewer.html`.
