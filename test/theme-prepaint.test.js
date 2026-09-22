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
  /* viewer.js: ?theme= wins, then a stored value, then the embedding page's hint,
     and 'auto' means follow the OS. The head script mirrors that; if the two ever
     disagree the handover flickers. */
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

/* Mdv-Theme-Prefers is the embedding page's background, put in the src by the
   embed snippet before the iframe exists. It is the weakest source and exists
   only so the first frame is right on a page whose theme disagrees with the
   reader's OS. */
const HINT = '&Mdv-Theme-Prefers=';
const hintUrl = (v, extra) => `http://localhost/viewer/viewer.html?src=t.md${extra || ''}${HINT}${v}`;

test('the page hint decides colour when nothing more authoritative exists', async () => {
  const dark = await boot({ url: hintUrl('dark'), markdown: '# A\n', dark: false });
  assert.equal(dark.d.documentElement.getAttribute('data-theme'), 'dark',
    'a dark page beats a light OS');
  /* It must survive apply(): an earlier version let viewer.js ignore the hint, so
     auto fell back to the OS and reverted the attribute one tick later. */
  assert.equal(dark.w.getComputedStyle(dark.d.documentElement).getPropertyValue('--bg').trim(), '#1d2125',
    'and the palette it applied is the dark one, still');
  const light = await boot({ url: hintUrl('light'), markdown: '# A\n', dark: true });
  assert.equal(light.d.documentElement.getAttribute('data-theme'), 'light',
    'a light page beats a dark OS');
});

test('the reader\'s stored choice outranks the page hint', async () => {
  const h = await boot({ url: hintUrl('dark'), markdown: '# A\n', dark: false, seed: { 'mdv-theme': 'light' } });
  assert.equal(h.d.documentElement.getAttribute('data-theme'), 'light');
  const d = await boot({ url: hintUrl('light'), markdown: '# A\n', dark: true, seed: { 'mdv-theme': 'dark' } });
  assert.equal(d.d.documentElement.getAttribute('data-theme'), 'dark');
});

test('?theme= outranks the page hint, and the hint is skipped in the snippet', async () => {
  const h = await boot({ url: hintUrl('dark', '&theme=light'), markdown: '# A\n', dark: true });
  assert.equal(h.d.documentElement.getAttribute('data-theme'), 'light');
  /* The snippet only appends the hint when the src carries no ?theme=, which is
     what keeps a deliberately pinned page from being overridden by its own
     background. */
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const snippet = readme.slice(readme.indexOf('Paste this into the HTML macro'), readme.indexOf('Note: in the HTML macro'));
  assert.match(snippet, /if \(\/\[\?&\]theme=\/\.test\(f\.src\)\) return;/,
    'the snippet skips the hint when the src already pins ?theme=');
  assert.match(snippet, /Mdv-Theme-Prefers=/, 'and appends it otherwise');
});

test('the page postMessage still overrides the hint', async () => {
  /* The hint is a guess made before the page's real colours arrive. When they do,
     they win - which is also what makes a wrong guess self-correcting. */
  const h = await boot({ url: hintUrl('dark'), markdown: '# A\n', dark: false });
  assert.equal(h.d.documentElement.getAttribute('data-theme'), 'dark', 'hint applied first');
  h.w.dispatchEvent(new h.w.MessageEvent('message', {
    origin: 'http://localhost',
    data: { type: 'mdv-theme', theme: 'light', bg: '#ffffff', fg: '#172b4d', link: '#0052cc' },
  }));
  await h.tick(0);
  assert.equal(h.d.documentElement.getAttribute('data-theme'), 'light',
    'the page\'s own colours replace the guess');
});

test('the hint is not an API: its spelling is exact', async () => {
  /* It is read case-sensitively so it cannot be reached by guessing at the public
     parameter names, and an unrecognised value is ignored rather than trusted. */
  const lower = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&mdv-theme-prefers=dark', markdown: '# A\n', dark: false });
  assert.equal(lower.d.documentElement.getAttribute('data-theme'), 'light', 'lowercase spelling is ignored');
  const junk = await boot({ url: hintUrl('chartreuse'), markdown: '# A\n', dark: false });
  assert.equal(junk.d.documentElement.getAttribute('data-theme'), 'light', 'an unrecognised value is ignored');
});
