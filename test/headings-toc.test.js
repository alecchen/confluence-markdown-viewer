'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

test('headings get GitHub-style ids', async () => {
  const h = await boot({ markdown: '## Hello World\n### Deep *dive*\n' });
  assert.equal(h.d.querySelector('#content h2').id, 'hello-world');
  assert.ok(h.d.querySelector('#content h3').id, 'h3 has an id');
});

test('each heading gets a copy-link (chain) button', async () => {
  const h = await boot({ markdown: '# Top\n## Section A\n' });
  const anchors = h.d.querySelectorAll('#content h1 .anchor-link, #content h2 .anchor-link');
  assert.equal(anchors.length, 2);
});

test('clicking the chain icon copies a URL pointing at the section', async () => {
  const h = await boot({ markdown: '## Hello World\n' });
  const btn = h.d.querySelector('#content h2 .anchor-link');
  btn.click();
  await h.tick(0);
  assert.equal(h.clipboard.text, h.url.split('#')[0] + '#hello-world');
});

test('?toc=1 renders a table of contents from the headings', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=published/test.md&toc=1', markdown: '# A\n## B\n### C\n' });
  const details = h.d.querySelector('#content .toc');
  assert.ok(details, 'TOC details element exists');
  assert.equal(details.querySelector('summary').textContent, 'Contents');
  const links = details.querySelectorAll('a');
  assert.equal(links.length, 3);
  assert.equal(links[0].getAttribute('href'), '#a');
  assert.equal(links[1].getAttribute('href'), '#b');
  assert.ok(details.querySelector('li.toc-l1') && details.querySelector('li.toc-l3'), 'TOC items carry their heading level');
});

test('no TOC without ?toc=1', async () => {
  const h = await boot({ markdown: '# A\n' });
  assert.equal(h.d.querySelector('#content .toc'), null);
});

test('embedded: the chain icon copies a Confluence URL, not the viewer URL', async () => {
  const h = await boot({
    referrer: 'https://confluence.example/pages/viewpage.action?pageId=42',
    markdown: '## Hello World\n',
  });
  const btn = h.d.querySelector('#content h2 .anchor-link');
  btn.click();
  await h.tick(0);
  assert.equal(h.clipboard.text, 'https://confluence.example/pages/viewpage.action?pageId=42#hello-world');
});

test('embedded: a parent-sent page URL wins over an origin-only referrer', async () => {
  const h = await boot({ referrer: 'https://confluence.example', markdown: '## Hello World\n' });
  h.w.dispatchEvent(new h.w.MessageEvent('message', {
    origin: 'https://confluence.example',
    data: { type: 'mdv-parent-url', url: 'https://confluence.example/pages/viewpage.action?pageId=42' },
  }));
  const btn = h.d.querySelector('#content h2 .anchor-link');
  btn.click();
  await h.tick(0);
  assert.equal(h.clipboard.text, 'https://confluence.example/pages/viewpage.action?pageId=42#hello-world');
});

test('TOC links stay in-frame while content links open in a new tab', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/test.md&toc=1',
    markdown: '# A\n[ext](https://example.com)\n',
  });
  const tocLink = h.d.querySelector('#content .toc a');
  assert.equal(tocLink.hasAttribute('target'), false, 'TOC links do not get target=_blank');
  const contentLink = h.d.querySelector('#content a[href^="http"]');
  assert.equal(contentLink.getAttribute('target'), '_blank');
});

/* The chunked path reserves a placeholder where the TOC will go, so filling it in
   at the end does not shove the document down under a reader who has started. The
   placeholder used to be a <details class="toc"> that never got removed, so a
   chunked render with ?toc=1 ended up with two .toc elements: an empty one left in
   the wrapper, and the real one nested inside it. */
test('a chunked render with ?toc=1 leaves exactly one TOC, and it is populated', async () => {
  const md = '# Title\n\n' + Array.from({ length: 20 }, (_, i) => `## S${i}\n\nbody ${i}\n\n`).join('');
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&toc=1&chunk=1&budget=1', markdown: md });
  for (let i = 0; i < 300 && !h.d.querySelector('#content .anchor-link'); i++) await h.tick(10);

  const tocs = h.d.querySelectorAll('#content .toc');
  assert.equal(tocs.length, 1, 'exactly one TOC element survives the chunked render');
  assert.equal(tocs[0].querySelectorAll('a').length, 21, 'and it lists every heading');
  assert.equal(h.d.querySelectorAll('#content .mdv-toc-slot').length, 0, 'the placeholder class is gone');
  assert.equal(h.d.querySelectorAll('#content .mdv-toc-placeholder').length, 0, 'no placeholder wrapper is left behind');

  /* The TOC belongs above the first chunk, not between chunks. */
  const first = h.d.querySelector('#content').firstElementChild;
  assert.ok(first.classList.contains('toc'), 'the TOC is still the first child');
});

test('the chunked and one-shot TOCs are the same list', async () => {
  const md = '# Title\n\n' + Array.from({ length: 10 }, (_, i) => `## S${i}\n\nbody ${i}\n\n`).join('');
  const many = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&toc=1&chunk=1&budget=1', markdown: md });
  const one = await boot({ url: 'http://localhost/viewer/viewer.html?src=t.md&toc=1&chunk=0', markdown: md });
  for (let i = 0; i < 300 && !many.d.querySelector('#content .anchor-link'); i++) await many.tick(10);
  const hrefs = (h) => Array.from(h.d.querySelectorAll('#content .toc a')).map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs(many), hrefs(one));
});
