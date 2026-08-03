'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const pressEscape = (h) => {
  h.d.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};
const overlay = (h) => h.d.querySelector('.mdv-lightbox');

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
