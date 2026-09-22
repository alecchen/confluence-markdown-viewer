'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { boot } = require('./harness');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'css', 'viewer.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8');

/* Everything a reader sees before the render - the "Loading..." text and the page
   background - comes from css/viewer.css, because apply() in js/viewer.js cannot
   run until three libs have loaded. A reader on a dark theme therefore used to get
   a white flash. The palette is now set before first paint from two places, and
   this file keeps them honest. */

test('the dark palette is declared for both the attribute and the media query', () => {
  const attr = /:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
  const media = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/.exec(css);
  assert.ok(attr, 'a [data-theme="dark"] block declares the dark palette');
  assert.ok(media, 'the media query covers a reader with no data-theme (no JS)');
  /* Both must carry the same values, or the handover from one to the other steps. */
  const norm = (s) => s.split(';').map((d) => d.trim()).filter(Boolean)
    .filter((d) => d.startsWith('--')).sort().join(';');
  assert.equal(norm(media[1]), norm(attr[1]),
    'the media-query palette and the attribute palette are identical');
  assert.match(attr[1], /--bg:\s*#1d2125/, 'dark --bg matches CONFLUENCE_DEFAULT.dark');
});

test('the pre-paint palette matches what viewer.js resolves for auto+dark', () => {
  const js = fs.readFileSync(path.join(ROOT, 'js', 'viewer.js'), 'utf8');
  /* CONFLUENCE_DEFAULT is the palette `auto` resolves to for a reader with no
     Confluence colours (standalone, OS dark), which is exactly the case the
     pre-paint stylesheet stands in for. GITHUB.dark is a different palette and
     must not be matched here. */
  const block = /CONFLUENCE_DEFAULT = \{\s*light:\s*\{[^}]*\},\s*dark:\s*\{([^}]*)\}/.exec(js);
  assert.ok(block, 'CONFLUENCE_DEFAULT.dark is parseable');
  const bg = /bg:\s*'(#[0-9a-f]{6})'/.exec(block[1])[1];
  const fg = /fg:\s*'(#[0-9a-f]{6})'/.exec(block[1])[1];
  const link = /link:\s*'(#[0-9a-f]{6})'/.exec(block[1])[1];
  const attr = /:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css)[1];
  assert.match(attr, new RegExp('--bg:\\s*' + bg), 'dark --bg agrees with the viewer');
  assert.match(attr, new RegExp('--fg:\\s*' + fg), 'dark --fg agrees with the viewer');
  assert.match(attr, new RegExp('--link:\\s*' + link), 'dark --link agrees with the viewer');
});

test('viewer.html settles the theme in the head, before the stylesheet is used', () => {
  /* It has to be an inline script in the head, above the <link>: a saved
     preference or ?theme= can disagree with the OS, and CSS can read neither.
     Below the stylesheet would leave a frame painted with the default palette. */
  const head = html.slice(0, html.indexOf('</head>'));
  const inline = /<script>([\s\S]*?)<\/script>/.exec(head);
  assert.ok(inline, 'viewer.html has an inline script in the head');
  assert.ok(inline.index < head.indexOf('<link rel="stylesheet"'),
    'the inline script comes before the stylesheet link');
  assert.equal(head.indexOf('<script', inline.index + 1), -1, 'it is the only script in the head');
  assert.match(inline[1], /mdv-theme/, 'it reads the saved preference');
  assert.match(inline[1], /params\.get\('theme'\)|URLSearchParams/, 'it reads ?theme=');
  assert.match(inline[1], /setAttribute\('data-theme'/, 'it sets the attribute the CSS keys on');
});

test('the pre-paint script agrees with viewer.js on how theme is chosen', async () => {
  /* viewer.js: ?theme= wins, then a stored value, and 'auto' means follow the OS.
     The head script mirrors that; if the two ever disagree the handover flickers. */
  const g = await boot({
    url: 'http://localhost/viewer/viewer.html?src=t.md&theme=dark',
    markdown: '# A\n',
    seed: { 'mdv-theme': 'light' },
    dark: false,
  });
  assert.equal(g.d.documentElement.getAttribute('data-theme'), 'dark',
    '?theme= wins over a stored preference in the viewer');
  const h = await boot({ markdown: '# A\n', seed: { 'mdv-theme': 'light' }, dark: true });
  assert.equal(h.d.documentElement.getAttribute('data-theme'), 'light',
    'a stored preference wins over the OS in the viewer');
  const a = await boot({ markdown: '# A\n', dark: true });
  assert.equal(a.d.documentElement.getAttribute('data-theme'), 'dark',
    'with nothing stored, auto follows the OS');
});
