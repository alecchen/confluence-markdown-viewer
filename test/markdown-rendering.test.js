'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

test('GFM: tables render as <table> with header cells', async () => {
  const h = await boot({ markdown: '| a | b |\n| --- | --- |\n| 1 | 2 |\n' });
  const table = h.d.querySelector('#content table');
  assert.ok(table, 'a table element exists');
  assert.equal(h.d.querySelectorAll('#content table th').length, 2);
  assert.equal(h.d.querySelectorAll('#content table td').length, 2);
});

test('GFM: task lists render as checked checkboxes', async () => {
  const h = await boot({ markdown: '- [x] done\n- [ ] todo\n' });
  const checks = h.d.querySelectorAll('#content input[type="checkbox"]');
  assert.equal(checks.length, 2);
  assert.equal(checks[0].checked, true);
  assert.equal(checks[1].checked, false);
});

test('GFM: strikethrough renders as <del>', async () => {
  const h = await boot({ markdown: '~~gone~~' });
  assert.equal(h.d.querySelector('#content del').textContent, 'gone');
});

test('code blocks are highlighted by highlight.js', async () => {
  const h = await boot({ markdown: '```js\nconst x = 1;\n```\n' });
  const code = h.d.querySelector('#content pre code');
  assert.ok(code, 'code element exists');
  assert.ok(code.classList.contains('hljs'), 'hljs class applied');
});

/* highlight.js auto-detection runs every registered grammar over an unlabeled
   block and bails on the first line matching more than one of them, so a long
   log dump costs ~130ms of blocking work. Untagged fences therefore render as
   plain code - they keep the code background, they are just not tokenized. */
test('a fence with no language tag is not auto-detected, and still renders as code', async () => {
  const h = await boot({ markdown: '```\n2026-01-01 INFO some log line\nplain text, no language given\n```\n' });
  const code = h.d.querySelector('#content pre code');
  assert.ok(code, 'code element exists');
  assert.equal(code.className, '', 'no hljs class: no detection ran');
  assert.match(code.textContent, /plain text, no language given/);
  const pre = h.d.querySelector('#content pre');
  assert.ok(pre, 'pre keeps the code block styling');
  assert.equal(h.d.querySelectorAll('#content .copy-btn').length, 1, 'still gets a Copy button');
});

test('paragraph text is rendered', async () => {
  const h = await boot({ markdown: 'Hello world' });
  assert.equal(h.d.querySelector('#content p').textContent, 'Hello world');
});
