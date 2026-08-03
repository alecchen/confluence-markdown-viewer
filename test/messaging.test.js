'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const dataTheme = (h) => h.d.documentElement.getAttribute('data-theme');
const bg = (h) => h.d.documentElement.style.getPropertyValue('--bg');
const send = (h, origin, data) =>
  h.w.dispatchEvent(new h.w.MessageEvent('message', { origin, data }));

const THEME_MSG = { type: 'mdv-theme', theme: 'dark', bg: '#123456', fg: '#abcdef', link: '#0a0b0c' };

test('theme message from the parent origin is applied', async () => {
  const h = await boot({ referrer: 'https://parent.example/embed/page' });
  send(h, 'https://parent.example', THEME_MSG);
  assert.equal(dataTheme(h), 'dark');
  assert.equal(bg(h), '#123456');
  assert.equal(h.d.documentElement.style.getPropertyValue('--link'), '#0a0b0c');
});

test('theme message from a different origin is ignored', async () => {
  const h = await boot({ referrer: 'https://parent.example/embed/page' });
  send(h, 'https://evil.example', THEME_MSG);
  assert.equal(dataTheme(h), 'light', 'theme unchanged');
  assert.equal(bg(h), '#ffffff');
});

test('standalone (no referrer) accepts theme messages from any origin', async () => {
  const h = await boot();
  send(h, 'https://anything.example', THEME_MSG);
  assert.equal(dataTheme(h), 'dark');
  assert.equal(bg(h), '#123456');
});

test('non-object message data is ignored', async () => {
  const h = await boot({ referrer: 'https://parent.example/embed/page' });
  send(h, 'https://parent.example', 'not-an-object');
  assert.equal(dataTheme(h), 'light');
});

test('height is reported to the parent only when embedded', async () => {
  const embedded = await boot({ embedded: true });
  await embedded.tick(80);
  const height = embedded.sent.filter((s) => s.data.type === 'mdv-height');
  assert.equal(height.length, 1);
  assert.equal(typeof height[0].data.height, 'number');
  assert.equal(height[0].origin, '*');

  const standalone = await boot();
  await standalone.tick(80);
  assert.equal(standalone.sent.filter((s) => s.data.type === 'mdv-height').length, 0);
});

test('mdv-hash from the parent scrolls to the heading (post-render)', async () => {
  const h = await boot({ embedded: true, referrer: 'https://confluence.example/pages/1', markdown: '## Target\n' });
  send(h, 'https://confluence.example', { type: 'mdv-hash', id: 'target' });
  const scrolls = h.sent.filter((s) => s.data.type === 'mdv-scroll');
  assert.equal(scrolls.length, 1);
  assert.equal(typeof scrolls[0].data.top, 'number');
});

test('mdv-hash before render is applied once the doc renders', async () => {
  let resolveFetch;
  const h = await boot({
    embedded: true,
    referrer: 'https://confluence.example/pages/1',
    fetchImpl: () => new Promise((res) => { resolveFetch = res; }),
  });
  send(h, 'https://confluence.example', { type: 'mdv-hash', id: 'late' });
  assert.equal(h.sent.filter((s) => s.data.type === 'mdv-scroll').length, 0, 'no scroll before render');
  resolveFetch({ ok: true, status: 200, text: async () => '## Late\n' });
  await h.tick(0);
  assert.equal(h.sent.filter((s) => s.data.type === 'mdv-scroll').length, 1);
});

test('mdv-hash from a different origin is ignored', async () => {
  const h = await boot({ embedded: true, referrer: 'https://confluence.example/pages/1', markdown: '## Target\n' });
  send(h, 'https://evil.example', { type: 'mdv-hash', id: 'target' });
  assert.equal(h.sent.filter((s) => s.data.type === 'mdv-scroll').length, 0);
});

test('mdv-parent-url from a different origin is ignored', async () => {
  const h = await boot({ referrer: 'https://confluence.example/pages/1', markdown: '## Target\n' });
  send(h, 'https://evil.example', { type: 'mdv-parent-url', url: 'https://evil.example/pages/hack' });
  const btn = h.d.querySelector('#content h2 .anchor-link');
  btn.click();
  await h.tick(0);
  assert.equal(h.clipboard.text, 'https://confluence.example/pages/1#target');
});
