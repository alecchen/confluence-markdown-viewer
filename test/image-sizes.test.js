'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const imgWidth = (h) => h.d.querySelector('#content img').getAttribute('width');

test('=width after the destination: =50% and =100px', async () => {
  assert.equal(await boot({ markdown: '![a](img.png =50%)' }).then(imgWidth), '50%');
  assert.equal(await boot({ markdown: '![a](img.png =100px)' }).then(imgWidth), '100px');
});

test('Obsidian-style |width in the alt text: |50 is px, |50% is percent', async () => {
  assert.equal(await boot({ markdown: '![a|60](img.png)' }).then(imgWidth), '60px');
  assert.equal(await boot({ markdown: '![a|60%](img.png)' }).then(imgWidth), '60%');
});

test('plain images get no width attribute', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  assert.equal(imgWidth(h), null);
});

test('alt text pipes that are not a size stay literal', async () => {
  const h = await boot({ markdown: '![pipe|and](img.png)' });
  assert.equal(h.d.querySelector('#content img').getAttribute('alt'), 'pipe|and');
  assert.equal(imgWidth(h), null);
});

test('size composes with relative path resolution', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/foo.md',
    markdown: '![a](images/x.png =50%)',
  });
  const img = h.d.querySelector('#content img');
  assert.equal(img.getAttribute('src'), 'published/images/x.png');
  assert.equal(img.getAttribute('width'), '50%');
});

test('size syntax inside a code fence is left alone', async () => {
  const h = await boot({ markdown: '```\n![a](img.png =50%)\n```' });
  assert.equal(h.d.querySelector('#content img'), null);
  assert.ok(h.d.querySelector('#content pre code').textContent.includes('=50%'));
});

test('the viewer does not invent dimensions for an image', async () => {
  /* Reserving an image's box before its bytes arrive was tried and abandoned, so
     this asserts it stays abandoned. The measurements, for the next person who
     has the idea:
       - `aspect-ratio: attr(width) / attr(height)` is dropped by Chromium - the
         computed value stays `auto` and a pending image is 300x0.
       - writing height on load changes nothing: an image that has loaded already
         exposes its own ratio, so the box was stable across a later reflow either
         way (A/B: one document height change in both builds).
       - a HEAD request returns headers, not dimensions, so learning the ratio
         still requires downloading the image.
     An author who wants a reserved box declares width AND height, which the
     browser honours on its own. */
  const h = await boot({ markdown: '![a](img.png)\n' });
  const img = h.d.querySelector('#content img');
  assert.equal(img.getAttribute('width'), null);
  assert.equal(img.getAttribute('height'), null);
});
