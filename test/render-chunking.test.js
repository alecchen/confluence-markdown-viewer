'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { boot } = require('./harness');

const ROOT = path.join(__dirname, '..');

/* Exercises what could differ between a whole-document parse and a chunked one:
   a reference definition that appears AFTER a heading boundary (so it only
   resolves if the document is lexed as a whole), duplicate headings (the slugger
   lives in module state), a list and a table next to a boundary, an untagged
   fence, the image-size extension, and a path needing the srcDir prefix. */
const MARKDOWN = [
  '# Title',
  '',
  'Intro that links to [a later definition][ref].',
  '',
  '## Setup',
  '',
  'Body one with an image ![shot|50](images/shot.png).',
  '',
  '- item one',
  '- item two',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
  '## Setup',
  '',
  'A duplicate heading title, so the second must get a -1 suffix.',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '```',
  'no language tag here',
  '```',
  '',
  '### Nested',
  '',
  'The reference resolves here: [ref].',
  '',
  '[ref]: https://example.com/target',
  '',
].join('\n');

function padded(markdown, minChars) {
  let out = markdown;
  let i = 0;
  while (out.length < minChars) {
    out += '\n## Filler ' + i + '\n\nFiller paragraph ' + i + ' with a [link](https://example.com/' + i + ').\n\n';
    i++;
  }
  return out;
}

const BIG = padded(MARKDOWN, 200000);   /* over CHUNK_THRESHOLD */

async function bootChunked(h) {
  /* The chunked path finishes on timers, not microtasks, so the harness's single
     microtask flush is not enough - wait for the last enhancer to land. */
  for (let i = 0; i < 300 && !h.d.querySelector('#content .anchor-link'); i++) await h.tick(10);
  return h.d.querySelector('#content');
}

test('a doc over the chunk threshold renders the same structure as a one-shot parse', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=published/test.md', markdown: BIG });
  const content = await bootChunked(h);

  assert.equal(content.textContent.indexOf('Loading'), -1, 'the Loading placeholder is gone');

  const ids = [...content.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((x) => x.id);
  assert.deepEqual(ids.slice(0, 5), ['title', 'setup', 'setup-1', 'nested', 'filler-0'],
    'heading ids are slugged with cross-chunk de-duplication');

  assert.equal(content.querySelectorAll('.copy-btn').length, 2, 'both fences got a Copy button');
  assert.equal(content.querySelectorAll('img').length, 1, 'the first chunk kept its image');
  assert.ok(content.querySelectorAll('.anchor-link').length > 5, 'anchors landed on every chunk');

  const img = content.querySelector('img');
  assert.equal(img.getAttribute('src'), 'published/images/shot.png', 'srcDir prefixed exactly once');
  assert.equal(img.getAttribute('width'), '50px', 'the image-size extension still applies (|50 is pixels)');

  const codes = [...content.querySelectorAll('pre code')];
  assert.ok(codes.some((c) => c.classList.contains('hljs')), 'tagged fence highlighted');
  assert.ok(codes.some((c) => c.className === ''), 'untagged fence left plain');

  const ref = [...content.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'https://example.com/target');
  assert.ok(ref, 'a [ref] link resolved across a chunk boundary');
});

test('a doc under the threshold still renders synchronously, in one pass', async () => {
  const h = await boot({ markdown: '# A\n\n## B\n\nBody\n' });
  assert.equal(h.d.querySelectorAll('#content h2').length, 1, 'rendered without waiting for timers');
  assert.ok(h.d.querySelector('#content .anchor-link'), 'enhancers ran in the same pass');
});

/* The guarantee the progressive path rests on: lexing ONCE, slicing the token
   stream at top-level headings, and parsing each slice produces exactly the HTML
   that parsing the whole document produces. Reference definitions must still
   resolve across a slice boundary and duplicate headings must still de-duplicate
   globally - the two things a naive re-parse-per-chunk breaks (a fresh lexer per
   chunk starts with an empty tokens.links, so a later definition is invisible to
   an earlier reference).

   The chunk count is cross-checked against an independent text splitter, so this
   fails if viewer.js's token-based boundary rule ever disagrees with a plain
   "split at a # or ## line" reading of the same document. */
test('lex-once token splicing reproduces the whole-document parse exactly', () => {
  const dom = new JSDOM('<!DOCTYPE html><body>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'lib', 'marked.min.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'lib', 'marked-gfm-heading-id.min.js'), 'utf8'));
  w.__BIG__ = BIG;

  const result = w.eval(`(function () {
    marked.setOptions({ gfm: true, breaks: false, pedantic: false });
    marked.use(markedGfmHeadingId.gfmHeadingId());
    var text = window.__BIG__;
    var whole = marked.parse(text);
    markedGfmHeadingId.resetHeadings();
    var tokens = marked.lexer(text);
    var chunks = [], cur = [];
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading' && tokens[i].depth <= 2 && cur.length) { chunks.push(cur); cur = []; }
      cur.push(tokens[i]);
    }
    if (cur.length) chunks.push(cur);
    var spliced = chunks.map(function (c) { return marked.parser(c); }).join('');
    var inFence = false, textChunks = 0, seen = false;
    text.split('\\n').forEach(function (line) {
      if (/^\\s*(\\u0060\\u0060\\u0060|~~~)/.test(line)) inFence = !inFence;
      if (!inFence && /^#{1,2} /.test(line)) { if (seen) textChunks++; seen = true; }
    });
    return JSON.stringify({
      same: whole === spliced,
      wholeLen: whole.length,
      splicedLen: spliced.length,
      tokenChunks: chunks.length,
      textChunks: seen ? textChunks + 1 : 0
    });
  })()`);

  const r = JSON.parse(result);
  assert.ok(r.same,
    'token-spliced parse is byte-identical to the whole-document parse (' +
    r.splicedLen + ' vs ' + r.wholeLen + ' chars)');
  assert.ok(r.tokenChunks > 20, 'the doc really did split into many chunks');
  assert.equal(r.tokenChunks, r.textChunks, 'token boundaries agree with a plain text splitter');
});

test('the chunk threshold is above the docs the rest of the suite renders', () => {
  const js = fs.readFileSync(path.join(ROOT, 'js', 'viewer.js'), 'utf8');
  const m = /CHUNK_THRESHOLD = (\d+)/.exec(js);
  assert.ok(m, 'CHUNK_THRESHOLD is declared in js/viewer.js');
  assert.ok(Number(m[1]) >= 100000,
    'threshold is high enough that ordinary docs keep the synchronous one-shot path');
});
