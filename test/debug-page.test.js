'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies;
const html = fs.readFileSync(path.join(ROOT, 'debug.html'), 'utf8');
const viewerHtml = fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8');
const viewerJs = fs.readFileSync(path.join(ROOT, 'js', 'viewer.js'), 'utf8');

/* debug.html builds its child document by rewriting the real viewer.html and
   inlining js/viewer.js, so it is coupled to both by string anchors. If an
   anchor moves, the page breaks at runtime with a message instead of silently
   measuring the wrong thing - but only in a browser. These assertions are the
   cheap version of that: they fail here instead. */

test('debug.html fetches the real viewer rather than carrying a copy', () => {
  assert.match(html, /fetch\('viewer\.html'\)/, 'fetches viewer.html');
  assert.match(html, /fetch\('js\/viewer\.js'\)/, 'fetches js/viewer.js');
  /* A second copy of either file would drift from the deployed one, which is
     exactly what this page exists to avoid. */
  assert.equal(html.indexOf('marked.setOptions'), -1, 'debug.html does not embed viewer.js');
});

test('the anchors debug.html rewrites are still present in the real files', () => {
  assert.match(viewerHtml, /<script src="lib\/marked\.min\.js"><\/script>/,
    'viewer.html still loads the vendored libs with plain script tags');
  assert.match(viewerHtml, /<script src="js\/viewer\.js"><\/script>/,
    'viewer.html still loads js/viewer.js with a plain script tag');
  assert.ok(viewerJs.indexOf('var params = new URLSearchParams(location.search);') !== -1,
    'js/viewer.js still has the one params line debug.html hooks');
  /* Both render paths must still set rendered = true, at their own indentation -
     debug.html keys off the indentation to patch each one exactly once. */
  assert.match(viewerJs, /^      rendered = true;$/m, 'renderChunked still marks completion');
  assert.match(viewerJs, /^    rendered = true;$/m, 'render still marks completion');
});

test('js/viewer.js can be inlined into a script tag', () => {
  /* A '</script' or an HTML comment opener inside the text would end the script
     element early or put the parser in script-data-escaped state, and the tag
     would never close. debug.html checks this too, but only in the browser. */
  assert.equal(viewerJs.indexOf('</script'), -1, "js/viewer.js contains no '</script'");
  assert.equal(viewerJs.indexOf('<!--'), -1, 'js/viewer.js contains no HTML comment opener');
});

test('the CDN URLs debug.html offers are pinned to package.json', () => {
  for (const dep of ['marked', 'marked-gfm-heading-id', 'highlight.js']) {
    const version = pkg[dep === 'highlight.js' ? '@highlightjs/cdn-assets' : dep];
    assert.ok(version, `${dep} is pinned in package.json`);
    assert.match(html, new RegExp('cdnjs\\.cloudflare\\.com/ajax/libs/' +
      dep.replace('.', '\\.') + '/' + version.replace(/\./g, '\\.') + '/'),
      `debug.html offers ${dep} at the pinned ${version}`);
  }
  assert.match(html, new RegExp('libs/mermaid/' + pkg.mermaid.replace(/\./g, '\\.') + '/'),
    `debug.html offers mermaid at the pinned ${pkg.mermaid}`);
  /* mermaid's own version is what the shipping viewer loads; the debug page must
     not offer a different one under the "as shipped" label. */
  assert.match(viewerJs, new RegExp('libs/mermaid/' + pkg.mermaid.replace(/\./g, '\\.') + '/'),
    'js/viewer.js MERMAID_CDN is the same pinned version');
});
