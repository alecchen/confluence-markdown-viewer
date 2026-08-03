'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

test('every code block gets a Copy button', async () => {
  const h = await boot({ markdown: '```js\nconst x = 1;\n```\n```py\nprint(1)\n```\n' });
  assert.equal(h.d.querySelectorAll('#content .copy-btn').length, 2);
});

test('clicking Copy puts the code text on the clipboard and shows feedback', async () => {
  const h = await boot({ markdown: '```js\nconst x = 1;\n```\n' });
  const btn = h.d.querySelector('#content .copy-btn');
  btn.click();
  await h.tick(0);
  assert.equal(h.clipboard.text, 'const x = 1;\n');
  assert.equal(btn.textContent, 'Copied');
});

test('mermaid is not loaded when the doc has no diagram', async () => {
  const h = await boot({ markdown: 'No diagrams here.\n' });
  assert.equal(h.d.querySelector('script[src*="mermaid"]'), null);
});

test('mermaid loads lazily only for docs that contain a diagram', async () => {
  const h = await boot({ markdown: '```mermaid\ngraph TD\nA-->B\n```\n' });
  const pre = h.d.querySelector('pre.mdv-mermaid');
  assert.ok(pre, 'mermaid block is tagged');
  const script = h.d.querySelector('script[src*="mermaid"]');
  assert.ok(script, 'mermaid script element appended');
  assert.match(script.getAttribute('src'), /mermaid\/10\.9\.1\/mermaid\.min\.js$/);
});

test('mermaid renders and re-renders on theme toggle', async () => {
  const h = await boot({ markdown: '```mermaid\ngraph TD\nA-->B\n```\n' });
  const pre = h.d.querySelector('pre.mdv-mermaid');

  /* resolve the lazily-loaded lib: the viewer resolves window.mermaid on the
     script's onload, so supply the stub and fire it. */
  h.w.mermaid = h.mermaid;
  h.d.querySelector('script[src*="mermaid"]').onload();
  await h.tick(30);

  assert.equal(h.mermaid.initCalls.length, 1);
  assert.equal(h.mermaid.initCalls[0].theme, 'default', 'light theme first');
  assert.equal(h.mermaid.renderCalls.length, 1);
  assert.match(h.mermaid.renderCalls[0].src, /graph TD/);
  assert.equal(pre.innerHTML, '<svg id="mdv-m-0"></svg>');

  /* auto -> light -> dark; the second click changes the resolved theme */
  h.d.getElementById('theme-toggle').click();
  h.d.getElementById('theme-toggle').click();
  await h.tick(30);

  assert.equal(h.mermaid.initCalls.length, 2, 're-initialized on theme change');
  assert.equal(h.mermaid.initCalls[1].theme, 'dark');
});
