'use strict';
/* Shared harness: boot a fresh jsdom window per test, load the real
   js/viewer.js into it (black-box), and expose the knobs tests assert on. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const VIEWER_JS = fs.readFileSync(path.join(__dirname, '..', 'js', 'viewer.js'), 'utf8');
const VIEWER_URL = 'http://localhost/viewer/viewer.html?src=published/test.md';

/* The three libs viewer.html loads eagerly are vendored in lib/. Eval the shipped
   files the way the page does, rather than require() the npm packages, so a test
   exercises the bytes that deploy - and a UMD bundle that only breaks under
   `eval` in a browser is caught here. `bundle` is what viewer.html's script tags
   name, `global` the window property that bundle assigns. */
const VENDORED = [
  { bundle: 'marked.min.js', global: 'marked' },
  { bundle: 'marked-gfm-heading-id.min.js', global: 'markedGfmHeadingId' },
  { bundle: 'highlight.min.js', global: 'hljs' },
];

/* Boot a viewer instance.
   opts:
     url        full viewer URL (query string carries ?src= etc.)
     referrer   document.referrer -> parent origin used for theme messages
     markdown   the markdown served by fetch
     fetchImpl  override fetch: fn(src) -> { ok, status, text() } or a rejected Promise
     dark       prefers-color-scheme: dark
     embedded   simulate being inside an iframe (height reporting enabled)
     seed       { key: value } written to localStorage before the viewer runs
*/
async function boot(opts = {}) {
  const {
    url = VIEWER_URL,
    referrer = '',
    markdown = '',
    fetchImpl = null,
    dark = false,
    embedded = false,
    hover = false,
    seed = null,
  } = opts;

  const domOpts = { url, runScripts: 'outside-only' };
  if (referrer) domOpts.referrer = referrer;
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body>' +
      '<div id="content" class="markdown-body">Loading&hellip;</div>' +
      '<button id="theme-toggle" type="button"></button>' +
      '</body></html>',
    domOpts
  );
  const w = dom.window;
  const d = w.document;

  /* The libs, loaded as the page loads them: eval each vendored bundle in the
     window, so the UMD wrapper assigns its own global exactly as it does in a
     browser. `outside-only` means jsdom runs no page script itself, so this is
     the order viewer.html produces - libs first, then viewer.js below. */
  for (const lib of VENDORED) {
    w.eval(fs.readFileSync(path.join(__dirname, '..', 'lib', lib.bundle), 'utf8'));
    if (!w[lib.global]) throw new Error(`lib/${lib.bundle} did not set window.${lib.global}`);
  }

  /* Shims for APIs jsdom does not implement. */
  w.matchMedia = (query) => ({
    matches: query.indexOf('(hover') === 0 ? hover : dark,
    media: query,
    addEventListener() {}, addListener() {}, removeEventListener() {},
  });
  Object.defineProperty(w, 'isSecureContext', { value: true, configurable: true });
  const clipboard = { text: null, writeText: async (text) => { clipboard.text = text; } };
  w.navigator.clipboard = clipboard;

  w.fetch = (src) => {
    if (fetchImpl) return Promise.resolve().then(() => fetchImpl(src));
    return Promise.resolve({ ok: true, status: 200, text: async () => markdown });
  };

  const mermaid = {
    initialize(conf) { mermaid.initCalls.push(conf); },
    render(id, src) { mermaid.renderCalls.push({ id, src }); return Promise.resolve({ svg: '<svg id="' + id + '"></svg>' }); },
    initCalls: [],
    renderCalls: [],
  };

  const sent = [];
  const parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  if (embedded) Object.defineProperty(w, 'parent', { value: parent, configurable: true });

  if (seed) for (const k of Object.keys(seed)) w.localStorage.setItem(k, seed[k]);

  w.eval(VIEWER_JS);
  await new Promise((resolve) => setTimeout(resolve, 0)); /* flush fetch -> render */

  const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return { w, d, dom, clipboard, mermaid, sent, parent, tick, url };
}

module.exports = { boot, VIEWER_URL };
