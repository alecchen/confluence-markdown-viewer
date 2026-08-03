'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const cssVar = (h, name) => h.d.documentElement.style.getPropertyValue(name);
const dataTheme = (h) => h.d.documentElement.getAttribute('data-theme');
const toggle = (h) => h.d.getElementById('theme-toggle');

test('default: auto / light, confluence palette, github code', async () => {
  const h = await boot({ markdown: 'x' });
  assert.equal(toggle(h).textContent, 'auto');
  assert.equal(dataTheme(h), 'light');
  assert.equal(cssVar(h, '--bg'), '#ffffff');
  assert.equal(cssVar(h, '--link'), '#0052cc');
  assert.equal(cssVar(h, '--code-bg'), '#f6f8fa');
});

test('the pill cycles auto -> light -> dark and persists to localStorage', async () => {
  const h = await boot({ markdown: 'x' });
  toggle(h).click();
  assert.equal(toggle(h).textContent, 'light');
  assert.equal(dataTheme(h), 'light');
  assert.equal(h.w.localStorage.getItem('mdv-theme'), 'light');

  toggle(h).click();
  assert.equal(toggle(h).textContent, 'dark');
  assert.equal(dataTheme(h), 'dark');
  assert.equal(h.w.localStorage.getItem('mdv-theme'), 'dark');
  assert.equal(cssVar(h, '--bg'), '#1d2125', 'confluence dark bg');
  assert.equal(cssVar(h, '--code-bg'), '#2e3440', 'nord dark code bg');
});

test('a stored theme is applied on load', async () => {
  const h = await boot({ markdown: 'x', seed: { 'mdv-theme': 'dark' } });
  assert.equal(dataTheme(h), 'dark');
});

test('?theme=dark forces dark on load', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=published/test.md&theme=dark', markdown: 'x' });
  assert.equal(dataTheme(h), 'dark');
  assert.equal(cssVar(h, '--bg'), '#1d2125');
});

test('?preset=github applies the github palette', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=published/test.md&preset=github', markdown: 'x' });
  assert.equal(cssVar(h, '--bg'), '#ffffff');
  assert.equal(cssVar(h, '--link'), '#0969da');
  assert.equal(cssVar(h, '--code-bg'), '#f6f8fa');
});

test('?code=nord overrides the code scheme in light theme', async () => {
  const h = await boot({ url: 'http://localhost/viewer/viewer.html?src=published/test.md&code=nord', markdown: 'x' });
  assert.equal(cssVar(h, '--code-bg'), '#eceff4');
});

test('prefers-color-scheme: dark resolves auto to dark', async () => {
  const h = await boot({ markdown: 'x', dark: true });
  assert.equal(dataTheme(h), 'dark');
});
