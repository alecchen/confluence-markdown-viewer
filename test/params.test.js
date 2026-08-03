'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

test('missing ?src shows the usage message', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html' });
  assert.match(h.d.getElementById('content').textContent, /Usage: viewer\.html\?src=/);
});

test('HTTP error from fetch shows a failed-to-load message', async () => {
  const h = await boot({ fetchImpl: () => ({ ok: false, status: 404 }) });
  assert.match(h.d.getElementById('content').textContent, /Failed to load .*HTTP 404/);
});

test('a fetch rejection shows a failed-to-load message', async () => {
  const h = await boot({ fetchImpl: () => { throw new Error('boom'); } });
  assert.match(h.d.getElementById('content').textContent, /Failed to load .*boom/);
});

test('the fetched source name appears in the error message', async () => {
  const h = await boot({
    url: 'http://localhost/viewer/viewer.html?src=published/missing.md',
    fetchImpl: () => ({ ok: false, status: 404 }),
  });
  assert.match(h.d.getElementById('content').textContent, /published\/missing\.md/);
});
