'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

const ERRATA = `## Errata

| Lecture | Issue | Status |
|---------|-------|--------|
| Lecture 01 | "HumanLayer" link returns 404 | [![PR #59 state](https://img.shields.io/github/pulls/detail/state/walkinglabs/learn-harness-engineering/59)](https://github.com/walkinglabs/learn-harness-engineering/pull/59) |
| Lecture 01 | "SWE-bench" link returns 404 | [![PR #58 state](https://img.shields.io/github/pulls/detail/state/SWE-bench/swe-bench.github.io/58)](https://github.com/SWE-bench/swe-bench.github.io/pull/58) |`;

const overlay = (h) => h.d.querySelector('.mdv-lightbox');

test('errata badges: both linked images open the link, never the lightbox', async () => {
  const h = await boot({ markdown: ERRATA });
  const imgs = [...h.d.querySelectorAll('#content img')];
  assert.equal(imgs.length, 2);
  for (const img of imgs) {
    assert.ok(img.closest('a'), 'badge is wrapped in a link');
    img.click();
    assert.ok(!overlay(h) || !overlay(h).classList.contains('open'),
      'clicking a linked badge must not open the lightbox');
  }
});
