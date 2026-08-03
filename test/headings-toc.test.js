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
