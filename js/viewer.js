/* Confluence Markdown Viewer — js/viewer.js */
(function () {
  'use strict';

  /* ---------- parent origin: derived, no hardcoded hosts ---------- */
  /* The embedding page's origin comes from document.referrer, so the viewer
     accepts messages from whatever page iframes it (your Confluence). The
     referrer is often trimmed to just the origin by Referrer-Policy, so the
     parent also posts its full URL (mdv-parent-url); that URL is what the
     "copy link to heading" button targets in the embed (the Confluence page +
     #heading id, since the heading lives inside the iframe). */
  var parentOrigin = null;
  var parentPageUrl = '';
  try {
    var ref = new URL(document.referrer);
    if (ref.protocol === 'https:' || ref.protocol === 'http:') {
      parentOrigin = ref.origin;
      parentPageUrl = ref.href.split('#')[0];
    }
  } catch (e) {}

  /* Code block palettes. Default: github for light, nord for dark.
     Explicit ?code= applies the chosen scheme to both themes. */
  var CODE = {
    github: {
      light: { bg: '#f6f8fa', fg: '#1f2328', k: '#cf222e', s: '#0a3069', c: '#6e7781', n: '#0550ae', t: '#8250df', a: '#0a3069' },
      dark:  { bg: '#161b22', fg: '#e6edf3', k: '#ff7b72', s: '#a5d6ff', c: '#8b949e', n: '#79c0ff', t: '#d2a8ff', a: '#79c0ff' }
    },
    nord: {
      light: { bg: '#eceff4', fg: '#2e3440', k: '#4f689e', s: '#60794e', c: '#6c7a8a', n: '#8e5b85', t: '#3f6c9e', a: '#60794e' },
      dark:  { bg: '#2e3440', fg: '#d8dee9', k: '#81a1c1', s: '#a3be8c', c: '#4c566a', n: '#b48ead', t: '#88c0d0', a: '#8fbcbb' }
    },
    solarized: {
      light: { bg: '#fdf6e3', fg: '#657b83', k: '#859900', s: '#2aa198', c: '#93a1a1', n: '#d33682', t: '#268bd2', a: '#b58900' },
      dark:  { bg: '#002b36', fg: '#839496', k: '#859900', s: '#2aa198', c: '#586e75', n: '#d33682', t: '#268bd2', a: '#b58900' }
    },
    'one-dark': {
      light: { bg: '#fafafa', fg: '#383a42', k: '#a626a4', s: '#50a14f', c: '#a0a1a7', n: '#986801', t: '#4078f2', a: '#e45649' },
      dark:  { bg: '#282c34', fg: '#abb2bf', k: '#c678dd', s: '#98c379', c: '#5c6370', n: '#d19a66', t: '#61afef', a: '#e06c75' }
    },
    atlassian: {
      light: { bg: '#f7f8f9', fg: '#172b4d', k: '#e5484d', s: '#216e4e', c: '#626f86', n: '#a54800', t: '#0c66e4', a: '#6e5dc6' },
      dark:  { bg: '#161a1d', fg: '#b6c2cf', k: '#f15b50', s: '#4bce97', c: '#8c9bab', n: '#fec57b', t: '#85b8ff', a: '#b8acf6' }
    }
  };
  var GITHUB = {
    light: { bg: '#ffffff', fg: '#1f2328', link: '#0969da', muted: '#57606a', border: '#d0d7de', header: '#f6f8fa' },
    dark:  { bg: '#0d1117', fg: '#e6edf3', link: '#4493f8', muted: '#8b949e', border: '#30363d', header: '#161b22' }
  };
  /* Confluence default palette, used as the B-preset fallback when no parent
     colors arrive (standalone open or GitHub Pages test). */
  var CONFLUENCE_DEFAULT = {
    light: { bg: '#ffffff', fg: '#172b4d', link: '#0052cc', muted: '#44546f', border: '#dfe1e6', header: '#f4f5f7' },
    dark:  { bg: '#1d2125', fg: '#b6c2cf', link: '#579dff', muted: '#9fadbc', border: '#454f59', header: '#2a3035' }
  };

  /* ---------- state ---------- */
  var themeMode = 'auto';        /* light | dark | auto (manual override) */
  var preset = 'confluence';     /* confluence (B) | github (A) */
  var conf = null;               /* {theme,bg,fg,link} from the parent page */
  var pendingHash = null;        /* heading id to scroll to once the doc renders */
  var rendered = false;          /* true once the first render() completes */

  var params = new URLSearchParams(location.search);
  if (params.get('preset') === 'github') preset = 'github';
  /* ?theme= is documented as forcing a theme for this load (README, Viewer
     parameters), so it has to outrank the stored preference - otherwise a reader
     who has ever clicked the theme toggle can never be forced by an embed, since
     the toggle writes mdv-theme to their own localStorage. */
  var themeParam = params.get('theme');
  var forcedTheme = ['light', 'dark', 'auto'].indexOf(themeParam) !== -1 ? themeParam : null;
  if (forcedTheme) themeMode = forcedTheme;
  var enableToc = params.get('toc') === '1' || params.get('toc') === 'true';
  var VALID_CODES = ['github', 'nord', 'solarized', 'one-dark', 'atlassian'];
  var codeScheme = VALID_CODES.indexOf(params.get('code')) !== -1 ? params.get('code') : 'default';
  var saved = null;
  try { saved = localStorage.getItem('mdv-theme'); } catch (e) {}
  if (!forcedTheme && (saved === 'light' || saved === 'dark' || saved === 'auto')) themeMode = saved;

  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var contentEl = document.getElementById('content');
  var toggleEl = document.getElementById('theme-toggle');
  /* In the embed the iframe is sized to the content box, so the doc's bottom
     padding would show as empty space above the page's comment area. */
  if (window.parent !== window) document.documentElement.classList.add('mdv-embedded');

  /* ---------- color helpers ---------- */
  function rgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  /* Confluence sends bg/fg/link; borders, muted text and table headers are derived */
  function derive(bg, fg, link, gh) {
    var f = rgb(fg) || rgb(gh.fg);
    /* accept any opaque CSS color, not just hex (Confluence often sends rgb()) */
    var bgOk = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
    return {
      bg: bgOk ? bg : gh.bg,
      fg: fg || gh.fg,
      link: link || gh.link,
      border: 'rgba(' + f + ',0.22)',
      muted: 'rgba(' + f + ',0.66)',
      header: 'rgba(' + f + ',0.07)',
      quote: 'rgba(' + f + ',0.05)'
    };
  }
  function palette(dark) {
    if (preset === 'github') return GITHUB[dark ? 'dark' : 'light'];
    /* use Confluence colors only when its reported theme matches the resolved one */
    if (conf && conf.bg && conf.fg && conf.theme === (dark ? 'dark' : 'light')) {
      return derive(conf.bg, conf.fg, conf.link, CONFLUENCE_DEFAULT[dark ? 'dark' : 'light']);
    }
    return CONFLUENCE_DEFAULT[dark ? 'dark' : 'light'];
  }
  function effectiveDark() {
    if (themeMode === 'light') return false;
    if (themeMode === 'dark') return true;
    if (conf && (conf.theme === 'light' || conf.theme === 'dark')) return conf.theme === 'dark';
    return mq.matches;
  }

  /* ---------- theme application ---------- */
  function updateToggle() {
    toggleEl.textContent = themeMode;
    toggleEl.title = 'Theme: ' + themeMode + ' (click to cycle auto / light / dark)';
  }
  function apply() {
    var dark = effectiveDark();
    var p = palette(dark);
    var scheme = codeScheme === 'default' ? (dark ? 'nord' : 'github') : codeScheme;
    var c = CODE[scheme][dark ? 'dark' : 'light'];
    var st = document.documentElement.style;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-preset', preset);
    st.setProperty('--bg', p.bg);
    st.setProperty('--fg', p.fg);
    st.setProperty('--link', p.link);
    st.setProperty('--muted', p.muted);
    st.setProperty('--border', p.border);
    st.setProperty('--table-header', p.header);
    st.setProperty('--blockquote', p.quote);
    st.setProperty('--code-bg', c.bg);
    st.setProperty('--code-fg', c.fg);
    st.setProperty('--tok-k', c.k);
    st.setProperty('--tok-s', c.s);
    st.setProperty('--tok-c', c.c);
    st.setProperty('--tok-n', c.n);
    st.setProperty('--tok-t', c.t);
    st.setProperty('--tok-a', c.a);
    updateToggle();
    scheduleHeight();
    renderMermaidIfNeeded();
  }
  var CYCLE = ['auto', 'light', 'dark'];
  toggleEl.addEventListener('click', function () {
    themeMode = CYCLE[(CYCLE.indexOf(themeMode) + 1) % CYCLE.length];
    try { localStorage.setItem('mdv-theme', themeMode); } catch (e) {}
    apply();
  });

  /* ---------- iframe height reporting ---------- */
  var lastReported = -1;
  function reportHeight() {
    if (window.parent === window) return;
    /* Measure the content box only: documentElement.scrollHeight tracks the
       iframe viewport once it outgrows the content, which feeds back into
       unbounded height growth. */
    var h = contentEl ? contentEl.offsetHeight : 0;
    if (h === lastReported) return;
    lastReported = h;
    window.parent.postMessage({ type: 'mdv-height', height: h + 2 }, '*');
  }
  function scheduleHeight() {
    if (window.parent === window) return;
    clearTimeout(scheduleHeight._t);
    scheduleHeight._t = setTimeout(reportHeight, 50);
  }
  if ('ResizeObserver' in window) new ResizeObserver(scheduleHeight).observe(document.body);
  window.addEventListener('resize', scheduleHeight);
  window.addEventListener('load', scheduleHeight);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleHeight);

  /* ---------- parent theme messages ---------- */
  window.addEventListener('message', function (e) {
    if (parentOrigin && e.origin !== parentOrigin) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'mdv-theme') {
      conf = { theme: d.theme, bg: d.bg, fg: d.fg, link: d.link };
      apply();
    }
    if (d.type === 'mdv-hash') {
      /* Deep link: the parent relays its #hash (the heading lives inside the
         iframe). Scroll now if rendered, else apply once render() completes. */
      if (rendered) startDeepLink(d.id);
      else pendingHash = d.id;
    }
    if (d.type === 'mdv-parent-url' && typeof d.url === 'string' && /^https?:/.test(d.url)) {
      /* Full embedding-page URL, in case the referrer is trimmed to the origin. */
      parentPageUrl = d.url.split('#')[0];
    }
    if (d.type === 'mdv-viewport' && typeof d.top === 'number' && typeof d.height === 'number') {
      /* The parent relays which slice of the content-height iframe is visible
         (top px into the iframe, height in px) so the fixed lightbox can pin
         itself to the on-screen area instead of the whole document. Standalone
         never receives this and keeps the viewport default. */
      viewportTop = d.top;
      viewportHeight = d.height;
      if (lightboxOpen) positionLightbox();
      if (previewOpen && previewAnchor) positionPreview(previewAnchor);
    }
  });

  /* ---------- render ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Headings already carry GitHub-style ids (marked-gfm-heading-id assigns them
     during parse). Give each one an anchor link whose click copies a URL to the
     section, then build a TOC if enabled. In the embed the iframe cannot
     scroll, so jump links ask the parent to scroll the Confluence page. */
  function scrollToHeading(id) {
    var target = document.getElementById(id);
    if (!target) return;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'mdv-scroll', top: Math.round(target.getBoundingClientRect().top) }, '*');
    } else {
      target.scrollIntoView();
    }
  }
  /* Deep links (page opened with a #heading) re-apply the scroll as the layout
     settles: images, web fonts and mermaid all render after render() and move
     headings, so a one-shot scroll can land short. Retry every 400ms for ~6s;
     the parent scroll math converges on the same absolute target each pass. */
  var deepLinkId = null;
  var deepLinkTries = 0;
  function startDeepLink(id) {
    if (!id) return;
    deepLinkId = id;
    deepLinkTries = 0;
    scrollToHeading(id);
    scheduleDeepLinkScroll();
  }
  function scheduleDeepLinkScroll() {
    if (!deepLinkId || deepLinkTries >= 15) { deepLinkId = null; return; }
    clearTimeout(scheduleDeepLinkScroll._t);
    scheduleDeepLinkScroll._t = setTimeout(function () {
      deepLinkTries++;
      scrollToHeading(deepLinkId);
      scheduleDeepLinkScroll();
    }, 400);
  }
  /* Each enhancer takes the node it should work on: the whole content element
     for a one-shot render, or just the chunk that was appended when a large doc
     is rendered progressively. They must never be re-run over the whole document
     after the first pass - addCopyButtons, enableImageZoom and enableLinkPreviews
     append or bind without a guard, and rewriteAssetPaths would prefix a path a
     second time. */
  function addHeadingAnchors(root) {
    (root || contentEl).querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function (h) {
      if (!h.id || h.querySelector('.anchor-link')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'anchor-link';
      b.title = 'Copy link to heading';
      b.setAttribute('aria-label', 'Copy link to heading: ' + h.textContent);
      b.innerHTML = LINK_ICON;
      b.addEventListener('click', function () {
        copyAnchorLink(b, h.id);
      });
      h.appendChild(b);
    });
  }
  function enhanceHeadings() {
    var headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (enableToc && headings.length) {
      var items = [];
      headings.forEach(function (h) {
        items.push('<li class="toc-l' + h.tagName[1] + '"><a href="#' + h.id + '">' + escapeHtml(h.textContent) + '</a></li>');
      });
      var details = document.createElement('details');
      details.className = 'toc';
      details.open = true;
      details.innerHTML = '<summary>Contents</summary><ul>' + items.join('') + '</ul>';
      /* A progressive render reserved space for the TOC before the first chunk.
         Replace that placeholder rather than nesting inside it: the placeholder
         carries a real .toc of its own for measuring, so appending into it would
         leave two .toc elements - an empty one and the real one inside it. The
         one-shot render has no placeholder and inserts at the top. */
      var slot = contentEl.querySelector(':scope > .mdv-toc-placeholder');
      if (slot) {
        contentEl.replaceChild(details, slot);
      } else {
        contentEl.insertBefore(details, contentEl.firstChild);
      }
      contentEl.querySelectorAll('.toc a').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          scrollToHeading(a.getAttribute('href').slice(1));
        });
      });
    }
    addHeadingAnchors();
    var hashId = (location.hash || '').slice(1);
    if (hashId) startDeepLink(hashId);
    if (pendingHash) {
      var ph = pendingHash;
      pendingHash = null;
      startDeepLink(ph);
    }
  }

  /* ---------- gantt time zones ---------- */
  /* Mermaid gantt has no time-zone concept: `dateFormat HH:mm` reads every clock
     against the browser's own day, so a chart written in one zone shows the wrong
     hours in another. A `%% tz-base: <zone>` comment inside the fence opts a
     block in; the fence stays otherwise intact and is re-processed from its own
     text on every zone change, never from the rendered SVG.
     Only the clocks move. Mermaid resolves every short time against one local
     day and lays the tasks out in the order they appear, so shifting all of them
     by the same amount leaves both the order and each task's length alone: a
     duration window keeps its width, and a task that ran past midnight is still
     the one that does. Zones are resolved through Intl for the date the chart is
     drawn from, so the shift follows DST rather than a fixed hour count. */
  var TZ_RE = /^\s*%%\s*tz-base\s*:\s*(.+?)\s*$/;
  /* A task's start and end are separate comma-separated fields; a field counts
     as a clock when that is all it holds, which leaves ids, status tags and
     durations (`30m`) alone. */
  var CLOCK_FIELD_RE = /^\s*\d{1,2}:[0-5]\d\s*$/;
  var DIRECTIVE_RE = /^\s*(?:%%|gantt\b|dateFormat\b|axisFormat\b|title\b|section\b|excludes\b|includes\b|todayMarker\b|tickInterval\b|inclusiveEndDates\b|click\b|href\b)/;
  var tzSupported = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  /* Fixed offsets parse arithmetically; anything else goes through Intl, which
     resolves IANA names for the date being charted (DST included) and throws
     RangeError on junk - no allowlist to maintain. */
  function resolveOffsetMinutes(tz, ref) {
    if (!tz) return null;
    var s = String(tz).trim();
    var m = /^(?:UTC|GMT)?\s*([+-])(\d{2}):?(\d{2})$/i.exec(s);
    if (m) return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: s, timeZoneName: 'shortOffset' })
        .formatToParts(ref || new Date());
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type !== 'timeZoneName') continue;
        var g = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(parts[i].value);
        if (!g) return null;
        return (g[1] === '-' ? -1 : 1) * (parseInt(g[2], 10) * 60 + parseInt(g[3] || '0', 10));
      }
      return null;
    } catch (e) { return null; }
  }
  function tzOk(tz) { return resolveOffsetMinutes(tz) !== null; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function hm(min) {
    var t = ((Math.round(min) % 1440) + 1440) % 1440;
    return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
  }
  function hmMin(h, m) {
    var hh = parseInt(h, 10), mm = parseInt(m, 10);
    if (hh > 24 || (hh === 24 && mm > 0)) return null;   /* a loose 24:00 is midnight */
    return (hh * 60 + mm) % 1440;
  }
  function fmtOffset(min) {
    var a = Math.abs(min);
    return 'UTC' + (min < 0 ? '-' : '+') + pad2(Math.floor(a / 60)) + ':' + pad2(a % 60);
  }
  /* "Asia/Shanghai (UTC+08:00)"; a zone that only parses as a fixed offset keeps
     its own spelling instead of repeating itself. */
  function tzLabel(tz) {
    var off = resolveOffsetMinutes(tz);
    if (off === null) return tz;
    return /^(?:UTC|GMT)?\s*[+-]\d{2}/i.test(String(tz).trim())
      ? fmtOffset(off) : tz + ' (' + fmtOffset(off) + ')';
  }
  function tzBaseOf(src) {
    if (!/^\s*gantt\b/.test(src)) return null;
    var lines = src.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = TZ_RE.exec(lines[i]);
      if (m && tzOk(m[1])) return m[1].trim();
    }
    return null;
  }
  /* The picker lists zones a reader recognises - the fixed-offset spellings the
     comment accepts, then the regions these charts come from - rather than
     Intl.supportedValuesOf's 400+ names. The viewer's own zone leads the list
     when it is not already in it, since that is the default. */
  var TZ_HOURLY = ['UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai',
    'Asia/Karachi', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  function tzOptions(zone, base) {
    var list = [], seen = {};
    function add(z) {
      if (!z || seen[z] || !tzOk(z)) return;
      seen[z] = 1;
      list.push(z);
    }
    add(zone);
    add(base);
    for (var i = -12; i <= 14; i++) add(fmtOffset(i * 60));
    TZ_HOURLY.forEach(add);
    return list;
  }

  /* Minutes the target zone's clocks sit ahead of the base zone's. Resolved for
     today, which is the day mermaid charts a `HH:mm` diagram on, so a zone in
     another DST state is compared on its current offset rather than a fixed one. */
  function zoneDelta(base, target) {
    var from = resolveOffsetMinutes(base);
    var to = resolveOffsetMinutes(target);
    return from === null || to === null ? null : to - from;
  }

  /* One task line, moved. Only whole fields that are a clock are touched, so ids,
     status tags and durations (`30m`) pass through untouched. Mermaid reads an end
     earlier than its start as running to the next day, and both clocks move by
     the same amount, so that wrap survives without having to be named. */
  function shiftTaskLine(line, delta) {
    var colon = line.indexOf(':');
    if (colon === -1) return line;
    var head = line.slice(0, colon + 1);
    var parts = line.slice(colon + 1).split(',');
    for (var i = 0; i < parts.length; i++) {
      if (!CLOCK_FIELD_RE.test(parts[i])) continue;
      var at = parts[i].indexOf(':');
      var v = hmMin(parts[i].slice(0, at), parts[i].slice(at + 1));
      if (v !== null) parts[i] = parts[i].replace(/\d{1,2}:[0-5]\d/, hm(v + delta));
    }
    return head + parts.join(',');
  }

  /* Rewrites a block. Directives and comments are stepped over: the tz-base line
     itself carries something that reads as a clock, and a `click` target can too. */
  function shiftGantt(src, delta) {
    return src.split('\n').map(function (line) {
      if (DIRECTIVE_RE.test(line) || line.indexOf(':') === -1) return line;
      return shiftTaskLine(line, delta);
    }).join('\n');
  }

  function zoneCtl(b) {
    var wrap = document.createElement('div');
    wrap.className = 'mdv-tz';
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Time zone for this diagram');
    tzOptions(b.zone, b.base).forEach(function (z) {
      var o = document.createElement('option');
      o.value = z;
      o.textContent = tzLabel(z);
      sel.appendChild(o);
    });
    sel.value = b.zone;
    sel.addEventListener('change', function () {
      if (sel.value) b.zone = sel.value;
      redrawZoneBlock(b);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  /* Base and target run through the same resolver, so a chart keeps its own hours
     exactly when the reader is already in its zone: the delta lands on 0 and the
     block is rendered as authored. */
  function redrawZoneBlock(b) {
    var delta = zoneDelta(b.base, b.zone);
    var text = delta === null || delta === 0 ? b.src : shiftGantt(b.src, delta);
    loadMermaid().then(function () {
      return mermaid.render('mdv-m-' + (mermaidSeq++), text);
    }).then(function (r) {
      b.pre.innerHTML = r.svg;
    }).catch(function (err) {
      b.pre.innerHTML = '<div class="mermaid-error">Mermaid error: ' + escapeHtml(err.message) + '</div>';
    });
  }

  /* ---------- mermaid diagrams (lazy, from the CDN) ----------
     1MB, only docs with a diagram pay for it, so it stays off-origin. The three
     libs viewer.html loads eagerly are vendored in lib/ instead: same-origin,
     gzipped by Apache, and no per-lib cross-origin round trip before the first
     render. */
  var MERMAID_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js';
  /* ?mermaid=<url> points the lazy load somewhere else - a local mirror, or a
     copy vendored in lib/. Only absolute http(s) URLs are accepted, so a query
     string cannot turn this into a path traversal. */
  var mermaidParam = params.get('mermaid');
  if (mermaidParam && /^https?:\/\//i.test(mermaidParam)) MERMAID_CDN = mermaidParam;
  var mermaidBlocks = [];
  var lastMermaidTheme = null;
  var mermaidPromise = null;
  var mermaidSeq = 0;

  function loadMermaid() {
    if (!mermaidPromise) {
      mermaidPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = MERMAID_CDN;
        s.onload = function () { resolve(window.mermaid); };
        s.onerror = function () { reject(new Error('mermaid failed to load')); };
        document.head.appendChild(s);
      });
    }
    return mermaidPromise;
  }

  function collectMermaid(root) {
    var el = root || contentEl;
    /* A progressively rendered doc calls this per chunk, so the block list
       accumulates across the whole document and renderAllMermaid can render the
       lot once, in text order, with the ids and the theme memo intact. A one-shot
       render still starts from empty. */
    if (el === contentEl) {
      mermaidBlocks = [];
      mermaidSeq = 0;
    }
    el.querySelectorAll('pre code.language-mermaid').forEach(function (code) {
      var src = code.textContent;
      var pre = code.parentNode;
      pre.classList.add('mdv-mermaid');   /* not 'mermaid': avoid auto-init on script load */
      mermaidBlocks.push({
        pre: pre,
        src: src,
        base: tzBaseOf(src),
        zone: tzSupported
      });
    });
  }

  function renderAllMermaid() {
    var theme = effectiveDark() ? 'dark' : 'default';
    lastMermaidTheme = theme;
    mermaid.initialize({ startOnLoad: false, theme: theme, securityLevel: 'loose' });
    var queue = Promise.resolve();
    mermaidBlocks.forEach(function (b) {
      queue = queue.then(function () {
        if (!b.base) {
          return mermaid.render('mdv-m-' + (mermaidSeq++), b.src).then(function (r) {
            b.pre.innerHTML = r.svg;
          }).catch(function (err) {
            b.pre.innerHTML = '<div class="mermaid-error">Mermaid error: ' + escapeHtml(err.message) + '</div>';
          });
        }
        /* A tagged block is re-rendered from its own text on every zone change,
           so the control sits above it and the svg is replaced in place. */
        if (!b.ctl) {
          b.ctl = zoneCtl(b);
          b.pre.parentNode.insertBefore(b.ctl, b.pre);
        }
        return Promise.resolve(redrawZoneBlock(b));
      });
    });
  }

  function renderMermaidIfNeeded() {
    if (!mermaidBlocks.length) return;
    var theme = effectiveDark() ? 'dark' : 'default';
    if (theme === lastMermaidTheme) return;
    loadMermaid().then(renderAllMermaid).catch(function () {});
  }

  /* ---------- copy-code buttons ---------- */
  function addCopyButtons(root) {
    (root || contentEl).querySelectorAll('pre').forEach(function (pre) {
      if (pre.classList.contains('mdv-mermaid')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        if (!code) return;
        copyText(code.textContent, btn);
      });
      pre.appendChild(btn);
    });
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function writeClipboard(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(legacyCopy(text)); });
    } else {
      done(legacyCopy(text));
    }
  }
  function copyText(text, btn) {
    writeClipboard(text, function (ok) {
      var orig = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { btn.textContent = orig; }, 1500);
    });
  }
  var LINK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
  /* Copy a URL pointing at a heading. In the embed the target is the Confluence
     page + #heading id (parentPageUrl), so pasting it opens the doc inside
     Confluence rather than the bare viewer. Standalone it falls back to the
     viewer URL. The chain icon swaps for a checkmark as feedback. */
  function copyAnchorLink(btn, id) {
    var base = parentPageUrl || location.href.split('#')[0];
    writeClipboard(base + '#' + id, function (ok) {
      var inner = btn.innerHTML;
      btn.innerHTML = ok ? CHECK_ICON : LINK_ICON;
      btn.title = ok ? 'Link copied' : 'Copy failed';
      setTimeout(function () { btn.innerHTML = inner; }, 1500);
    });
  }

  /* ---------- image lightbox ---------- */
  /* Images render as bare <img>, so a click does nothing by default. This opens
     an overlay showing the image at natural resolution - full-viewport
     standalone, pinned to the parent-reported visible slice in the embed -
     closed by a click anywhere or Esc. The "Open original" link opens the raw
     file in a new tab - the escape hatch for low-res sources. */
  var lightboxEl = null;
  var lightboxOpen = false;
  var viewportTop = null;       /* visible slice of the iframe, from the parent */
  var viewportHeight = null;

  function openLightbox(img) {
    if (!lightboxEl) {
      lightboxEl = document.createElement('div');
      lightboxEl.className = 'mdv-lightbox';
      lightboxEl.setAttribute('role', 'dialog');
      lightboxEl.setAttribute('aria-modal', 'true');
      var boxImg = document.createElement('img');
      boxImg.className = 'mdv-lightbox-img';
      var openLink = document.createElement('a');
      openLink.className = 'mdv-lightbox-link';
      openLink.textContent = 'Open original';
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      /* the link's click must not bubble up to the overlay's close handler */
      openLink.addEventListener('click', function (e) { e.stopPropagation(); });
      lightboxEl.appendChild(boxImg);
      lightboxEl.appendChild(openLink);
      lightboxEl.addEventListener('click', closeLightbox);
      document.body.appendChild(lightboxEl);
    }
    var src = img.currentSrc || img.src;
    var box = lightboxEl.querySelector('.mdv-lightbox-img');
    box.src = src;
    box.alt = img.alt || '';
    lightboxEl.querySelector('.mdv-lightbox-link').href = src;
    lightboxEl.setAttribute('aria-label', 'Image: ' + (img.alt || src));
    lightboxEl.classList.add('open');
    document.body.classList.add('mdv-lightbox-open');
    lightboxOpen = true;
    if (window.parent !== window) {
      /* Ask the parent for the current visible slice so the overlay centers in
         what is actually on screen, not the full document. */
      window.parent.postMessage({ type: 'mdv-viewport-request' }, '*');
    }
    positionLightbox();
  }

  function closeLightbox() {
    if (!lightboxOpen) return;
    lightboxOpen = false;
    lightboxEl.querySelector('.mdv-lightbox-img').src = '';
    lightboxEl.classList.remove('open');
    document.body.classList.remove('mdv-lightbox-open');
    lightboxEl.style.top = '';
    lightboxEl.style.height = '';
  }

  /* Pin the overlay to the parent-reported visible slice when embedded; reset to
     the default viewport fill otherwise (standalone, or before the first
     mdv-viewport arrives). */
  function positionLightbox() {
    if (!lightboxEl) return;
    if (window.parent !== window && viewportHeight !== null) {
      lightboxEl.style.top = viewportTop + 'px';
      lightboxEl.style.height = viewportHeight + 'px';
    } else {
      lightboxEl.style.top = '';
      lightboxEl.style.height = '';
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      closeLightbox();
      hidePreview();
    }
  });

  /* shields.io badges are small status graphics; clicking one would zoom a
     tiny image to no benefit, so they keep their default (open) behavior. */
  function isShieldsIo(src) {
    return /\/\/(?:img\.)?shields\.io\//.test(src);
  }

  function enableImageZoom(root) {
    (root || contentEl).querySelectorAll('img').forEach(function (img) {
      img.addEventListener('click', function () {
        /* linked images keep the link's own behavior (matches GitHub) */
        if (img.closest('a')) return;
        if (isShieldsIo(img.currentSrc || img.src)) return;
        openLightbox(img);
      });
    });
  }

  /* ---------- relative asset paths ---------- */
  /* Images/attachments referenced with relative paths in the markdown resolve
     against the markdown file's directory, not the viewer page. */
  var srcDir = (function () {
    var parts = (params.get('src') || '').split('/');
    parts.pop();
    return parts.join('/');
  })();

  function rewriteAssetPaths(root) {
    if (!srcDir) return;
    var el = root || contentEl;
    var prefix = srcDir + '/';
    el.querySelectorAll('img[src], a[href], video[src], audio[src], source[src]').forEach(function (el) {
      var attr = el.hasAttribute('src') ? 'src' : 'href';
      var v = el.getAttribute(attr);
      if (!v) return;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(v) || v.indexOf('//') === 0) return;
      el.setAttribute(attr, prefix + v);
    });
    el.querySelectorAll('a[data-preview]').forEach(function (a) {
      var v = a.getAttribute('data-preview');
      if (v && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(v) && v.indexOf('//') !== 0) {
        a.setAttribute('data-preview', prefix + v);
      }
    });
  }

  /* Content links open in a new tab: inside the Confluence iframe, navigating
     the frame would lose the page. Fragment links (#...) stay in-frame so the
     viewer can scroll to them (TOC links are fragment links). */
  function setLinkTargets(root) {
    (root || contentEl).querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }

  function hoistPreviewTitles(root) {
    if (!window.matchMedia('(hover: hover)').matches) return;
    (root || contentEl).querySelectorAll('a[title^="preview:"]').forEach(function (a) {
      a.setAttribute('data-preview', a.getAttribute('title').replace(/^preview:\s*/, ''));
      a.removeAttribute('title');
    });
  }

  /* ---------- link hover preview ---------- */
  /* Hover a link with "preview:" in its title -> show a small thumbnail near the
     cursor; reuses the viewport-relay pattern the lightbox already relies on. */
  var previewEl = null;
  var previewOpen = false;
  var previewAnchor = null;

  function ensurePreviewEl() {
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.className = 'mdv-preview';
      var img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', hidePreview);
      previewEl.appendChild(img);
      document.body.appendChild(previewEl);
    }
    return previewEl;
  }

  function showPreview(a) {
    var box = ensurePreviewEl();
    box.querySelector('img').src = a.getAttribute('data-preview');
    box.classList.add('open');
    previewOpen = true;
    previewAnchor = a;
    positionPreview(a);
  }

  function hidePreview() {
    if (!previewOpen) return;
    previewOpen = false;
    previewAnchor = null;
    previewEl.classList.remove('open');
    previewEl.querySelector('img').src = '';
    previewEl.style.top = '';
    previewEl.style.left = '';
  }

  function positionPreview(a) {
    if (!previewEl) return;
    var r = a.getBoundingClientRect();
    var visibleTop = (window.parent !== window && viewportTop !== null) ? viewportTop : 0;
    var visibleH = (window.parent !== window && viewportHeight !== null)
      ? viewportHeight : window.innerHeight;
    var bw = previewEl.offsetWidth;
    var bh = previewEl.offsetHeight;
    var top = r.bottom - visibleTop + 8;
    if (top + bh > visibleH - 8) top = Math.max(8, r.top - visibleTop - bh - 8);
    if (top < 8) top = 8;
    var left = r.left + 12;
    if (left + bw > window.innerWidth - 8) left = window.innerWidth - bw - 8;
    if (left < 8) left = 8;
    previewEl.style.top = top + 'px';
    previewEl.style.left = left + 'px';
  }

  function enableLinkPreviews(root) {
    if (!window.matchMedia('(hover: hover)').matches) return;
    (root || contentEl).querySelectorAll('a[data-preview]').forEach(function (a) {
      a.addEventListener('mouseenter', function () { showPreview(a); });
      a.addEventListener('mouseleave', hidePreview);
      var img = new Image();
      img.src = a.getAttribute('data-preview');
    });
  }

  /* ---------- code highlighting ---------- */
  /* Only fences the author tagged with a language. An unlabeled fence makes
     highlight.js guess, and a guess runs every one of its 36 grammars over the
     block and stops at the first line that matches more than one of them - a
     50-line log dump costs ~130ms, and a doc full of them blocks the first paint
     for a second or more. Untagged blocks keep the plain code background, which
     is how the author asked for them to be read anyway. */
  function highlightCode(root) {
    (root || contentEl).querySelectorAll('pre code[class*="language-"]').forEach(function (el) {
      if (el.classList.contains('language-mermaid')) return;
      hljs.highlightElement(el);
    });
  }

  /* ---------- render ---------- */
  /* Every whole-document enhancer, scoped to a root. Passing contentEl is the
     one-shot render; passing a chunk's detached holder is the progressive render.
     Order matters in three places: hoistPreviewTitles must precede
     rewriteAssetPaths (the paths it prefixes are the ones the hoist creates),
     collectMermaid must precede addCopyButtons (a mermaid pre must not get a Copy
     button), and enhanceHeadings must precede setLinkTargets (TOC links are
     fragment links and must not get target=_blank). */
  function enhanceAll(root) {
    hoistPreviewTitles(root);
    rewriteAssetPaths(root);
    highlightCode(root);
    collectMermaid(root);
    setLinkTargets(root);
    enableImageZoom(root);
    enableLinkPreviews(root);
    addCopyButtons(root);
  }

  function render(text) {
    contentEl.innerHTML = marked.parse(text);
    enhanceAll();
    enhanceHeadings();
    rendered = true;
    apply();
  }
  function fail(msg) {
    contentEl.textContent = msg;
    apply();
  }

  /* ---------- progressive render ----------
     A large doc parsed and inserted in one shot keeps the reader on "Loading..."
     for as long as the whole thing takes (~170ms at 1MB, ~420ms at 2MB, seconds by
     10MB), because nothing paints until the last step finishes. Splitting the
     markdown at top-level headings and appending one chunk at a time lets the
     first section appear almost immediately.

     Two details make this exact rather than approximate:

     - The markdown is lexed ONCE and sliced by token, then each slice is run
       through marked's parser. Reference definitions therefore still resolve
       across chunk boundaries, and because the heading-id extension keeps its
       slugger in module state, resetting it once before the loop gives every
       chunk a share of the same de-duplication - a doc with two "## Setup"
       headings gets setup and setup-1 in the chunked render exactly as in the
       whole-document one. The concatenated HTML is identical to marked.parse on
       the whole text; test/render-chunking.test.js asserts that with its own
       independent splitter.

     - Frames are yielded only after the first chunk, then once per FRAME_BUDGET
       of work. Yielding per chunk is what a naive version does and it is far
       worse than not chunking at all: every yield costs a frame (~16ms), so a
       doc with 2400 headings spent 36 SECONDS in frame waits. One yield after the
       first chunk costs nothing measurable and is what buys the visible win. */
  var CHUNK_THRESHOLD = 150000;   /* chars; below this a single synchronous parse */
  var FRAME_BUDGET = 25;          /* ms of parsing per yielded frame */
  /* ?chunk=N (0 disables chunking entirely) and ?budget=N let a reader tune the
     progressive render on a real document without editing and redeploying this
     file. Validation rejects junk; an empty value is 'not set', not 0. 0 is a
     special case rather than a literal threshold, because a threshold of 0 would
     mean "everything chunks" - the opposite of what 0 reads as. */
  var chunkParam = params.get('chunk');
  if (chunkParam !== null && chunkParam !== '') {
    var chunkNum = Number(chunkParam);
    if (isFinite(chunkNum) && chunkNum >= 0) CHUNK_THRESHOLD = chunkNum === 0 ? Infinity : chunkNum;
  }
  var budgetParam = params.get('budget');
  if (budgetParam !== null && budgetParam !== '') {
    var budgetNum = Number(budgetParam);
    if (isFinite(budgetNum) && budgetNum >= 1) FRAME_BUDGET = budgetNum;
  }

  /* Split lexed block tokens at top-level headings. A heading always closes the
     block before it, so no construct is cut in half: a list or table cannot
     continue across an h1/h2 boundary in CommonMark. */
  function chunkTokens(tokens) {
    var chunks = [];
    var cur = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'heading' && t.depth <= 2 && cur.length) {
        chunks.push(cur);
        cur = [];
      }
      cur.push(t);
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  /* Yield to the browser between budgeted frames of work.
     MessageChannel, not setTimeout or requestAnimationFrame:
       - setTimeout(0) is throttled to roughly once per second in a hidden tab and
         in some off-screen cases, which would make a backgrounded viewer crawl
         (a large doc needs on the order of a dozen frames). A MessageChannel port
         callback is a task the browser does not apply that throttle to - it is the
         same mechanism React's scheduler uses for exactly this reason.
       - requestAnimationFrame would simply stop in a hidden tab, and it is absent
         in the jsdom test harness.
     Falls back to setTimeout where MessageChannel is unavailable. */
  var yieldChannel = (typeof MessageChannel === 'function') ? new MessageChannel() : null;
  function yieldToBrowser(fn) {
    if (!yieldChannel) { setTimeout(fn, 0); return; }
    yieldChannel.port1.onmessage = function () { yieldChannel.port1.onmessage = null; fn(); };
    yieldChannel.port2.postMessage(0);
  }

  function renderChunked(text) {
    if (window.markedGfmHeadingId && markedGfmHeadingId.resetHeadings) {
      markedGfmHeadingId.resetHeadings();
    }
    /* Drop the "Loading…" placeholder the chunked path appends after rather than
       replacing, the way the one-shot path's innerHTML assignment does. */
    contentEl.textContent = '';
    /* With ?toc=1 the TOC is only known once every chunk is in, but it belongs at
       the top. Reserve its space now so filling it in later does not shove the
       document down under a reader who is already reading the first chunks. The
       placeholder holds a real details.toc carrying the same CSS, so the reserved
       space is the TOC's own intrinsic height, and enhanceHeadings() replaces the
       whole wrapper with the finished TOC.
       The measuring child carries .mdv-toc-measure on top of .toc, because
       enhanceHeadings() builds its link list from .toc a over the whole content
       element - without the extra class the placeholder's empty list would be
       counted as headings. */
    if (enableToc) {
      var slot = document.createElement('div');
      slot.className = 'mdv-toc-placeholder';
      var measure = document.createElement('details');
      measure.className = 'toc mdv-toc-measure';
      measure.innerHTML = '<summary>Contents</summary><ul><li></li></ul>';
      slot.appendChild(measure);
      contentEl.appendChild(slot);
    }
    var chunks = chunkTokens(marked.lexer(text));
    var i = 0;

    function step() {
      var started = Date.now();
      while (i < chunks.length) {
        var holder = document.createElement('div');
        holder.innerHTML = marked.parser(chunks[i]);
        /* Enhancers run on the detached holder, so an id lookup inside them
           (getElementById for a heading) can never see a half-built chunk. */
        enhanceAll(holder);
        var frag = document.createDocumentFragment();
        while (holder.firstChild) frag.appendChild(holder.firstChild);
        contentEl.appendChild(frag);
        i++;
        /* keep pulling work until the frame's budget is spent */
        if (Date.now() - started >= FRAME_BUDGET) break;
      }

      /* Report the height once per frame, not per chunk: scheduleHeight() would
         just restart its 50ms debounce on every chunk and so fire only once, after
         everything is in, which is the behaviour that keeps the early chunks
         hidden below a not-yet-grown iframe. reportHeight() is a no-op when the
         height has not changed, and one layout per frame is affordable. */
      reportHeight();

      if (i < chunks.length) {
        yieldToBrowser(step);
        return;
      }

      enhanceHeadings();
      rendered = true;
      apply();
    }
    step();
  }

  function renderDocument(text) {
    if (text.length >= CHUNK_THRESHOLD) renderChunked(text);
    else render(text);
  }

  marked.setOptions({ gfm: true, breaks: false, pedantic: false });
  /* GitHub-style heading ids come from marked-gfm-heading-id (lib/). If it ever
     fails to load, marked still emits its own ids, so anchors and the TOC keep
     working. */
  if (window.markedGfmHeadingId && typeof window.markedGfmHeadingId.gfmHeadingId === 'function') {
    marked.use(window.markedGfmHeadingId.gfmHeadingId());
  }

  /* ---------- image size syntax ---------- */
  /* CommonMark has no image-width syntax, so the viewer adds two extensions:
       ![alt](img.png =50%)   size after the destination (space before =)
       ![alt|50](img.png)     Obsidian style, size in the alt text
     |50 means 50px, |50% means 50%. Plain images fall through to marked. */
  marked.use({
    extensions: [{
      name: 'mdvImgSize',
      level: 'inline',
      start: function (src) { return src.indexOf('!['); },
      tokenizer: function (src) {
        var m = /^!\[([^\]]*?)\|([0-9]+(?:\.[0-9]+)?)(%?)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(src);
        if (m) {
          return { type: 'mdvImgSize', raw: m[0], text: m[1], href: m[4], width: m[2] + (m[3] || 'px'), title: m[5] };
        }
        m = /^!\[([^\]]*)\]\(([^)\s]+)\s+=\s*([^)\s]+)\)/.exec(src);
        if (!m) return;
        return { type: 'mdvImgSize', raw: m[0], text: m[1], href: m[2], width: m[3] };
      },
      renderer: function (tok) {
        var out = '<img src="' + escapeHtml(tok.href) + '" alt="' + escapeHtml(tok.text) + '"';
        if (tok.title) out += ' title="' + escapeHtml(tok.title) + '"';
        return out + ' width="' + escapeHtml(tok.width) + '">';
      }
    }]
  });

  var src = params.get('src');
  if (!src) {
    fail('Usage: viewer.html?src=published/foo.md');
  } else {
    fetch(src)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(renderDocument)
      .catch(function (err) { fail('Failed to load "' + src + '": ' + err.message); });
  }

  apply();
  mq.addEventListener('change', apply);
})();
