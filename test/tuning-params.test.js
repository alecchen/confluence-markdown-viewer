'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { boot } = require('./harness');

/* ?chunk= and ?budget= exist so the progressive render can be tuned against a
   real document without editing and redeploying js/viewer.js (debug.html drives
   them). They are read-only knobs: they change when chunking starts, never what
   it produces.

   The fixture has to be big enough for renderChunked to actually run out of its
   frame budget and yield - a small doc finishes in the first synchronous step and
   would make the "progressive" assertions below pass for the wrong reason.
   Measured in this harness: 6k chars finishes in one step, 30k yields partway. */
const BIG = (() => {
  const bits = ['# Title\n\n'];
  let i = 0, n = 12;
  while (n < 30000) {
    const s = `## Section ${i}\n\nBody ${i} with [a link](https://example.com/${i}) and some more prose.\n\n`;
    bits.push(s);
    n += s.length;
    i++;
  }
  return bits.join('');
})();

const HEADINGS = BIG.match(/^## /gm).length;

async function finish(h) {
  for (let i = 0; i < 400 && !h.d.querySelector('#content .anchor-link'); i++) await h.tick(10);
  return h.d.querySelector('#content');
}

test('at the shipped threshold this fixture renders in one pass', async () => {
  /* Guards the fixture size and documents why the threshold is where it is: 30k
     characters is under CHUNK_THRESHOLD, so the default path is one-shot. */
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md', markdown: BIG });
  assert.equal(h.d.querySelectorAll('#content h2').length, HEADINGS,
    'the default path completes this fixture without yielding');
});

test('?chunk=0 turns chunking off, so the whole document lands in one pass', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&chunk=0', markdown: BIG });
  assert.equal(h.d.querySelectorAll('#content h2').length, HEADINGS,
    'a one-shot render is complete after the harness flushes');
});

test('?chunk=1 forces the progressive path on a doc that would not take it', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&chunk=1&budget=1', markdown: BIG });
  assert.ok(h.d.querySelectorAll('#content h2').length < HEADINGS, 'it yields instead of finishing');
  assert.equal((await finish(h)).querySelectorAll('h2').length, HEADINGS, 'every chunk landed');
});

test('both paths produce the same document', async () => {
  const one = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&chunk=0', markdown: BIG });
  const many = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&chunk=1&budget=1', markdown: BIG });
  await finish(many);
  const ids = (h) => Array.from(h.d.querySelectorAll('#content h2')).map((x) => x.id);
  assert.deepEqual(ids(many), ids(one), 'heading ids match');
  assert.equal(many.d.querySelector('#content').textContent, one.d.querySelector('#content').textContent,
    'text content matches');
});

test('junk and out-of-range values fall back to the shipped behaviour', async () => {
  for (const q of ['chunk=abc', 'chunk=-1', 'chunk=', 'budget=0', 'budget=nope', 'budget=']) {
    const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&' + q, markdown: '# A\n\nBody\n' });
    assert.ok(h.d.querySelector('#content h1'), `${q} still renders`);
  }
});

test('?mermaid= is guarded to an absolute http(s) URL', async () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'viewer.js'), 'utf8');
  const guarded = fs.readFileSync(path.join(__dirname, '..', 'js', 'viewer.js'), 'utf8')
    .split('\n').some((line) =>
      line.indexOf('mermaidParam') !== -1 &&
      line.indexOf('MERMAID_CDN = mermaidParam') !== -1 &&
      /https\?:/.test(line));
  assert.ok(guarded,
    'the override assignment is guarded by an http(s) test, so a relative or javascript: value cannot redirect it');
  assert.equal((js.match(/MERMAID_CDN =/g) || []).length, 2, 'one declaration, one guarded override');
});
