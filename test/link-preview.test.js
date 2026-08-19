'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const HOVER = { hover: true };
const ENTER = (h, el) => el.dispatchEvent(new h.w.MouseEvent('mouseenter', { bubbles: true }));
const LEAVE = (h, el) => el.dispatchEvent(new h.w.MouseEvent('mouseleave', { bubbles: true }));
const PREVIEW = (h) => h.d.querySelector('.mdv-preview');

test('preview title is hoisted to data-preview and title is removed', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](deck.pdf "preview:cover.png")' });
  const a = h.d.querySelector('#content a');
  assert.equal(a.getAttribute('data-preview'), 'published/cover.png');
  assert.equal(a.getAttribute('title'), null);
});

test('dashed separator ("preview: cover.png") also parses', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](deck.pdf "preview: cover.png")' });
  const a = h.d.querySelector('#content a');
  assert.equal(a.getAttribute('data-preview'), 'published/cover.png');
  assert.equal(a.getAttribute('title'), null);
});

test('absolute preview path is not rewritten', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](http://e.com/d "preview:https://cdn.example.com/t.png")' });
  const a = h.d.querySelector('#content a');
  assert.equal(a.getAttribute('data-preview'), 'https://cdn.example.com/t.png');
});

test('link without preview title has no data-preview', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](deck.pdf)' });
  const a = h.d.querySelector('#content a');
  assert.equal(a.getAttribute('data-preview'), null);
});

test('mouseenter shows the tooltip with the correct img src', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](deck.pdf "preview:cover.png")' });
  const a = h.d.querySelector('#content a');
  ENTER(h, a);
  assert.ok(PREVIEW(h), 'tooltip exists');
  assert.ok(PREVIEW(h).classList.contains('open'), 'tooltip is open');
  assert.ok(PREVIEW(h).querySelector('img').src.indexOf('published/cover.png') !== -1);
});

test('mouseleave closes the tooltip', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](deck.pdf "preview:cover.png")' });
  const a = h.d.querySelector('#content a');
  ENTER(h, a);
  assert.ok(PREVIEW(h).classList.contains('open'));
  LEAVE(h, a);
  assert.ok(!PREVIEW(h).classList.contains('open'));
});

test('Escape closes the tooltip', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](deck.pdf "preview:cover.png")' });
  const a = h.d.querySelector('#content a');
  ENTER(h, a);
  assert.ok(PREVIEW(h).classList.contains('open'));
  h.d.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!PREVIEW(h).classList.contains('open'));
});

test('hover:false (touch) — no tooltip appears', async () => {
  const h = await boot({ markdown: '[deck](deck.pdf "preview:cover.png")' });
  const a = h.d.querySelector('#content a');
  assert.equal(a.getAttribute('data-preview'), null, 'no data-preview without hover');
});

test('embedded: mdv-viewport sets the tooltip top offset', async () => {
  const h = await boot({ ...HOVER, embedded: true, referrer: 'https://confluence.example/p/1',
    markdown: '[deck](deck.pdf "preview:cover.png")' });
  h.w.dispatchEvent(new h.w.MessageEvent('message', {
    origin: 'https://confluence.example',
    data: { type: 'mdv-viewport', top: 120, height: 500 },
  }));
  const a = h.d.querySelector('#content a');
  ENTER(h, a);
  const top = parseInt(PREVIEW(h).style.top, 10);
  assert.ok(top >= 0 && top < 500, 'top is within the visible slice');
});

test('broken preview image closes the tooltip', async () => {
  const h = await boot({ ...HOVER, markdown: '[deck](deck.pdf "preview:missing.png")' });
  const a = h.d.querySelector('#content a');
  ENTER(h, a);
  const img = PREVIEW(h).querySelector('img');
  img.dispatchEvent(new h.w.Event('error'));
  assert.ok(!PREVIEW(h).classList.contains('open'));
});
