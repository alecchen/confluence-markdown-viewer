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
