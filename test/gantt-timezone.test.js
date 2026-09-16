'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');

/* The zone the viewer resolves as its own comes from the process TZ, fixed for
   the whole test file - node caches the resolved zone. Everything asserted here
   uses explicit fixed-offset zones, so the results do not depend on which zone
   the machine happens to be in. */

async function bootChart(markdown) {
  const h = await boot({ markdown: markdown });
  h.w.mermaid = h.mermaid;
  h.d.querySelector('script[src*="mermaid"]').onload();
  await h.tick(40);
  return h;
}

/* Pick a zone the way the browser does: set the value, then fire change. */
async function pick(h, zone) {
  const sel = h.d.querySelector('#content .mdv-tz select');
  assert.ok(Array.from(sel.options).some((o) => o.value === zone), zone + ' is offered');
  sel.value = zone;
  sel.dispatchEvent(new h.w.Event('change'));
  await h.tick(40);
  return sel;
}

const TAGGED = [
  '```mermaid',
  'gantt',
  'dateFormat HH:mm',
  'axisFormat %H:%M',
  'title Latency (UTC+08:00)',
  '%% tz-base: +08:00',
  'section warm',
  'TTFT :done, r1, 09:00, 09:14',
  '```',
  ''
].join('\n');

const SOURCE = TAGGED.replace('```mermaid\n', '').replace(/```\n$/, '');

test('a diagram without a tz-base comment renders exactly once, as before', async () => {
  const h = await bootChart('```mermaid\ngraph TD\nA-->B\n```\n');
  assert.equal(h.mermaid.renderCalls.length, 1);
  assert.ok(h.mermaid.renderCalls[0].src.indexOf('graph TD') !== -1);
  assert.equal(h.d.querySelector('#content .mdv-tz'), null, 'no zone picker');
});

test('a tz-base comment the viewer cannot resolve is ignored', async () => {
  const h = await bootChart(TAGGED.replace('%% tz-base: +08:00', '%% tz-base: Mars/Olympus'));
  assert.equal(h.d.querySelector('#content .mdv-tz'), null);
  assert.equal(h.mermaid.renderCalls.length, 1);
  assert.ok(h.mermaid.renderCalls[0].src.indexOf('tz-base: Mars/Olympus') !== -1, 'left as authored');
});

test('a non-gantt mermaid block carrying the comment gets no picker', async () => {
  const h = await bootChart('```mermaid\n%% tz-base: +08:00\ngraph TD\nA-->B\n```\n');
  assert.equal(h.d.querySelector('#content .mdv-tz'), null);
  assert.equal(h.mermaid.renderCalls.length, 1);
  assert.ok(h.mermaid.renderCalls[0].src.indexOf('tz-base') !== -1, 'rendered as authored');
});

test('the picker defaults to the reader zone and lists the recognised ones', async () => {
  const h = await bootChart(TAGGED);
  const sel = h.d.querySelector('#content .mdv-tz select');
  assert.equal(sel.getAttribute('aria-label'), 'Time zone for this diagram');
  assert.equal(sel.value, h.w.Intl.DateTimeFormat().resolvedOptions().timeZone);
  const zones = Array.from(sel.options).map((o) => o.value);
  assert.equal(zones[0], sel.value, 'the reader zone leads');
  assert.ok(zones.indexOf('+08:00') !== -1, "the chart's own base zone is offered");
  assert.ok(zones.indexOf('UTC-10:00') !== -1, 'hourly offsets are offered');
  assert.ok(zones.indexOf('Asia/Shanghai') !== -1, 'regions are offered');
});

test('picking the base zone renders the block exactly as authored', async () => {
  const h = await bootChart(TAGGED);
  await pick(h, '+08:00');
  assert.equal(h.mermaid.renderCalls.length, 2);
  assert.equal(h.mermaid.renderCalls[1].src, SOURCE);
});

test('picking another zone moves every clock by the base-to-target offset', async () => {
  const h = await bootChart(TAGGED);
  await pick(h, 'UTC-10:00');
  /* base +08:00 -> target -10:00: clocks move back eighteen hours */
  assert.equal(h.mermaid.renderCalls.length, 2);
  assert.ok(h.mermaid.renderCalls[1].src.indexOf('TTFT :done, r1, 15:00, 15:14') !== -1);
  assert.equal(h.mermaid.renderCalls[1].src.indexOf('09:00, 09:14'), -1);
});

test('the tz-base line itself is never shifted', async () => {
  const h = await bootChart(TAGGED);
  await pick(h, 'UTC-05:00');
  assert.ok(h.mermaid.renderCalls[1].src.indexOf('%% tz-base: +08:00') !== -1);
  assert.equal(h.mermaid.renderCalls[1].src.indexOf('UTC-05:00'), -1, 'only the comment names a zone');
});

test('a task the document already runs past midnight keeps its wrap', async () => {
  const h = await bootChart(TAGGED.replace('09:00, 09:14', '23:30, 01:20'));
  await pick(h, 'UTC-10:00');
  /* both clocks move back ten hours, and the end still precedes its start */
  assert.ok(h.mermaid.renderCalls[1].src.indexOf('05:30, 07:20') !== -1);
  assert.ok(h.mermaid.renderCalls[1].src.indexOf('23:30, 01:20') === -1);
});

test('a whole-day pair stays a plain pair', async () => {
  const h = await bootChart(TAGGED);
  await pick(h, 'UTC+14:00');
  assert.ok(h.mermaid.renderCalls[1].src.indexOf('15:00, 15:14') !== -1);
});

test('ids, status tags and durations are left alone', async () => {
  const md = [
    '```mermaid',
    'gantt',
    'dateFormat HH:mm',
    '%% tz-base: +08:00',
    'section warm',
    'TTFT :crit, done, r1, 09:00, 09:14',
    'Hold :done, r2, after r1, 30m',
    '```',
    ''
  ].join('\n');
  const h = await bootChart(md);
  await pick(h, 'UTC-10:00');
  const out = h.mermaid.renderCalls[1].src;
  assert.ok(out.indexOf('TTFT :crit, done, r1, 15:00, 15:14') !== -1);  assert.ok(out.indexOf('Hold :done, r2, after r1, 30m') !== -1, 'an after/30m line has no clock to move');
});

test('re-picking re-renders from the block source, not from the last render', async () => {
  const h = await bootChart(TAGGED);
  await pick(h, 'UTC-10:00');
  await pick(h, 'Asia/Kolkata');
  assert.equal(h.mermaid.renderCalls.length, 3);
  /* back to base +08:00, then +05:30 in Kolkata: two and a half hours earlier */
  assert.ok(h.mermaid.renderCalls[2].src.indexOf('TTFT :done, r1, 06:30, 06:44') !== -1);
});

test('an IANA base zone resolves through Intl, DST included', async () => {
  const md = [
    '```mermaid',
    'gantt',
    'dateFormat HH:mm',
    '%% tz-base: America/Los_Angeles',
    'section warm',
    'TTFT :done, r1, 09:00, 09:14',
    '```',
    ''
  ].join('\n');
  const h = await bootChart(md);
  await pick(h, 'UTC');
  /* on the charted day Los Angeles is on UTC-7, so clocks move forward 7h */
  assert.match(h.mermaid.renderCalls[1].src, /TTFT :done, r1, 16:00, 16:14/);
});
