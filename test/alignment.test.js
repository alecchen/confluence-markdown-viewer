'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies;

/* lib/ holds the three libs the page needs before the first render, served
   same-origin (see sync-libs.sh). A stale copy here is invisible at runtime -
   the viewer just renders with the old parser - so the vendored bytes are
   compared against the npm packages pinned in package.json. */
const VENDORED = {
  'marked.min.js': ['marked', 'marked/marked.min.js'],
  'marked-gfm-heading-id.min.js': ['marked-gfm-heading-id', 'marked-gfm-heading-id/lib/index.umd.js'],
  'highlight.min.js': ['@highlightjs/cdn-assets', '@highlightjs/cdn-assets/highlight.min.js'],
};

test('lib/ is byte-identical to the packages pinned in package.json', () => {
  for (const [file, [dep, from]] of Object.entries(VENDORED)) {
    const vendored = path.join(ROOT, 'lib', file);
    const installed = path.join(ROOT, 'node_modules', from);
    assert.ok(fs.existsSync(vendored), `lib/${file} exists - run ./sync-libs.sh`);
    assert.equal(
      fs.readFileSync(vendored).toString('base64'),
      fs.readFileSync(installed).toString('base64'),
      `lib/${file} is stale - run ./sync-libs.sh (${dep}@${pkg[dep]})`);
  }
});

test('viewer.html loads the vendored libs and no cross-origin script for them', () => {
  const html = fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8');
  for (const file of Object.keys(VENDORED)) {
    assert.match(html, new RegExp(`src="lib/${file.replace('.', '\\.')}"`),
      `viewer.html loads lib/${file}`);
  }
  /* jsDelivr is blocked in the Confluence environment and cdnjs costs a
     connection per lib before the first render; mermaid is the one exception
     because it is 1MB and lazy (js/viewer.js, MERMAID_CDN). */
  const cdn = [...html.matchAll(/src="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(cdn, [], 'viewer.html has no cross-origin script tags');
});

test('mermaid stays the only CDN dependency, at the version package.json pins', () => {
  const js = fs.readFileSync(path.join(ROOT, 'js', 'viewer.js'), 'utf8');
  const m = /MERMAID_CDN = 'https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/mermaid\/([0-9][^/]*)\//.exec(js);
  assert.ok(m, 'MERMAID_CDN is a pinned cdnjs URL');
  assert.equal(m[1], pkg.mermaid, 'mermaid: package.json does not match the CDN URL');
});
