'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

test('relative image srcs resolve against the markdown directory', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/foo.md',
    markdown: '![a](images/x.png)\n',
  });
  assert.equal(h.d.querySelector('#content img').getAttribute('src'), 'published/images/x.png');
});

test('relative link hrefs resolve against the markdown directory', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/foo.md',
    markdown: '[report](report.pdf)\n',
  });
  assert.equal(h.d.querySelector('#content a').getAttribute('href'), 'published/report.pdf');
});

test('absolute, root-relative and anchor references are left alone', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/foo.md',
    markdown: '[ext](https://example.com/x.png) [root](/x.png) [hash](#sec) [proto](//cdn.example/x.png)\n',
  });
  const hrefs = Array.from(h.d.querySelectorAll('#content a')).map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['https://example.com/x.png', '/x.png', '#sec', '//cdn.example/x.png']);
});

test('video srcs in raw HTML resolve too', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/foo.md',
    markdown: '<video src="v.mp4"></video>\n',
  });
  assert.equal(h.d.querySelector('#content video').getAttribute('src'), 'published/v.mp4');
});

test('no rewrite when the markdown sits at the viewer root', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=test.md', markdown: '![a](x.png)\n' });
  assert.equal(h.d.querySelector('#content img').getAttribute('src'), 'x.png');
});

test('content links open in a new tab; fragment links stay in-frame', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/foo.md',
    markdown: '[ext](https://example.com) [rel](other.md) [hash](#sec)\n',
  });
  const links = h.d.querySelectorAll('#content a');
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.equal(links[0].getAttribute('rel'), 'noopener');
  assert.equal(links[1].getAttribute('target'), '_blank');
  assert.equal(links[1].getAttribute('rel'), 'noopener');
  assert.equal(links[2].hasAttribute('target'), false);
});
