'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

test('viewer.html and viewer.js load the exact cdnjs versions pinned in package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies;
  const sources = [
    fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'js', 'viewer.js'), 'utf8'),
  ].join('\n');

  /* lib -> version from every cdnjs script tag (incl. the lazy mermaid load) */
  const cdn = {};
  const re = /cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([0-9][^/]*)\//g;
  let m;
  while ((m = re.exec(sources)) !== null) cdn[m[1]] = m[2];

  const libs = ['marked', 'marked-gfm-heading-id', 'highlight.js', 'mermaid'];
  for (const lib of libs) {
    assert.ok(cdn[lib], `cdnjs pin found for ${lib}`);
    assert.equal(pkg[lib], cdn[lib],
      `${lib}: package.json (${pkg[lib]}) does not match cdnjs (${cdn[lib]})`);
  }
  assert.equal(Object.keys(cdn).length, libs.length, 'no unexpected cdnjs libs');
});
