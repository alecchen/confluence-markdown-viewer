'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const pressEscape = (h) => {
  h.d.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};
const overlay = (h) => h.d.querySelector('.mdv-lightbox');
const send = (h, origin, data) =>
  h.w.dispatchEvent(new h.w.MessageEvent('message', { origin, data }));

test('clicking an image opens the lightbox with the resolved src', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  assert.ok(overlay(h) && overlay(h).classList.contains('open'), 'lightbox is open');
  assert.equal(overlay(h).querySelector('.mdv-lightbox-img').getAttribute('src'),
    h.d.querySelector('#content img').src);
});

test('Escape closes the lightbox', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  pressEscape(h);
  assert.ok(!overlay(h).classList.contains('open'));
});

test('clicking the overlay closes it', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  overlay(h).click();
  assert.ok(!overlay(h).classList.contains('open'));
});

test('open-original link targets _blank and points at the resolved src', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  const a = overlay(h).querySelector('.mdv-lightbox-link');
  assert.equal(a.target, '_blank');
  assert.equal(a.getAttribute('href'), h.d.querySelector('#content img').src);
});

test('an image inside a link does not open the lightbox', async () => {
  const h = await boot({ markdown: '[![a](img.png)](http://example.com/x)' });
  h.d.querySelector('#content img').click();
  assert.ok(!overlay(h) || !overlay(h).classList.contains('open'));
});

test('a shields.io badge does not open the lightbox', async () => {
  const h = await boot({ markdown: '![b](https://img.shields.io/badge/build-passing-brightgreen.svg)' });
  h.d.querySelector('#content img').click();
  assert.ok(!overlay(h) || !overlay(h).classList.contains('open'));
});

test('embedded: mdv-viewport pins the lightbox to the visible slice', async () => {
  const h = await boot({ embedded: true, referrer: 'https://confluence.example/pages/1', markdown: '![a](img.png)' });
  send(h, 'https://confluence.example', { type: 'mdv-viewport', top: 120, height: 400 });
  h.d.querySelector('#content img').click();
  const lb = overlay(h);
  assert.equal(lb.style.top, '120px');
  assert.equal(lb.style.height, '400px');
});

test('embedded: the lightbox tracks mdv-viewport updates while open', async () => {
  const h = await boot({ embedded: true, referrer: 'https://confluence.example/pages/1', markdown: '![a](img.png)' });
  send(h, 'https://confluence.example', { type: 'mdv-viewport', top: 0, height: 900 });
  h.d.querySelector('#content img').click();
  send(h, 'https://confluence.example', { type: 'mdv-viewport', top: 300, height: 500 });
  const lb = overlay(h);
  assert.equal(lb.style.top, '300px');
  assert.equal(lb.style.height, '500px');
});

test('embedded: opening the lightbox asks the parent for the visible slice', async () => {
  const h = await boot({ embedded: true, referrer: 'https://confluence.example/pages/1', markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  assert.ok(h.sent.some((s) => s.data.type === 'mdv-viewport-request'));
});

test('embedded: mdv-viewport from a different origin is ignored', async () => {
  const h = await boot({ embedded: true, referrer: 'https://confluence.example/pages/1', markdown: '![a](img.png)' });
  send(h, 'https://evil.example', { type: 'mdv-viewport', top: 50, height: 100 });
  h.d.querySelector('#content img').click();
  const lb = overlay(h);
  assert.equal(lb.style.top, '');
  assert.equal(lb.style.height, '');
});

test('standalone: the lightbox keeps the default viewport-filling position', async () => {
  const h = await boot({ markdown: '![a](img.png)' });
  h.d.querySelector('#content img').click();
  const lb = overlay(h);
  assert.equal(lb.style.top, '');
  assert.equal(lb.style.height, '');
});
