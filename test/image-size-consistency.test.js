'use strict';
/* The viewer (marked extension in js/viewer.js) and the VS Code extension
   (markdown-it plugin in vscode-image-size/) implement the same syntax with two
   different engines. This test renders every supported form through both and
   asserts they produce the same width and alt — so one can never drift. */
const test = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const mdvImageSize = require('../vscode-image-size/mdv-image-size');
const { boot } = require('./harness');

const CASES = [
  '![a](img.png =50%)',
  '![a](img.png =100px)',
  '![a|60](img.png)',
  '![a|60%](img.png)',
  '![a](img.png)',
  '![pipe|and](img.png)',
  '![a|40](img.png "Title here")',
];

const attrOf = (html, name) => {
  const m = html.match(/<img[^>]*>/);
  if (!m) return null;
  const a = m[0].match(new RegExp(name + '="([^"]*)"'));
  return a ? a[1] : null;
};

test('viewer and VS Code extension render the same width and alt', async () => {
  const md = new MarkdownIt().use(mdvImageSize);
  for (const src of CASES) {
    const h = await boot({ markdown: src });
    const img = h.d.querySelector('#content img');
    const viewer = { width: img && img.getAttribute('width'), alt: img && img.getAttribute('alt') };
    const html = md.render(src);
    assert.equal(attrOf(html, 'width'), viewer.width, `width mismatch for ${src}`);
    assert.equal(attrOf(html, 'alt'), viewer.alt, `alt mismatch for ${src}`);
  }
});
