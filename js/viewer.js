/* Confluence Markdown Viewer — js/viewer.js */
(function () {
  'use strict';

  /* ---------- parent origin: derived, no hardcoded hosts ---------- */
  /* The embedding page's origin comes from document.referrer, so the viewer
     accepts theme messages from whatever page iframes it (your Confluence). */
  var parentOrigin = null;
  try {
    var ref = new URL(document.referrer);
    if (ref.protocol === 'https:' || ref.protocol === 'http:') parentOrigin = ref.origin;
  } catch (e) {}

  var SOLARIZED = {
    light: { bg: '#fdf6e3', fg: '#657b83' },
    dark:  { bg: '#002b36', fg: '#839496' }
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

  var params = new URLSearchParams(location.search);
  if (params.get('preset') === 'github') preset = 'github';
  if (['light', 'dark', 'auto'].indexOf(params.get('theme')) !== -1) themeMode = params.get('theme');
  var enableToc = params.get('toc') === '1' || params.get('toc') === 'true';
  var saved = null;
  try { saved = localStorage.getItem('mdv-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark' || saved === 'auto') themeMode = saved;

  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var contentEl = document.getElementById('content');
  var toggleEl = document.getElementById('theme-toggle');

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
    var s = SOLARIZED[dark ? 'dark' : 'light'];
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
    st.setProperty('--code-bg', s.bg);
    st.setProperty('--code-fg', s.fg);
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
  });

  /* ---------- render ---------- */
  function slugify(text) {
    return String(text).toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Assign an id to every h1-h6, then (if enabled) build a TOC that jumps to
     them. In the embed the iframe cannot scroll, so jump links ask the parent
     to scroll the Confluence page instead. */
  function enhanceHeadings() {
    var headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (!headings.length) return;
    var used = {}, items = [];
    headings.forEach(function (h) {
      var base = slugify(h.textContent) || 'section';
      var n = used[base] || 0;
      used[base] = n + 1;
      var slug = base + (n ? '-' + n : '');
      h.id = slug;
      items.push('<li class="toc-l' + h.tagName[1] + '"><a href="#' + slug + '">' + escapeHtml(h.textContent) + '</a></li>');
    });
    if (!enableToc) return;
    contentEl.insertAdjacentHTML('afterbegin',
      '<details class="toc" open><summary>Contents</summary><ul>' + items.join('') + '</ul></details>');
    contentEl.querySelectorAll('.toc a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(a.getAttribute('href').slice(1));
        if (!target) return;
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'mdv-scroll', top: Math.round(target.getBoundingClientRect().top) }, '*');
        } else {
          target.scrollIntoView();
        }
      });
    });
  }

  /* ---------- mermaid diagrams (lazy-loaded from cdnjs) ---------- */
  var MERMAID_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js';
  var mermaidBlocks = [];
  var lastMermaidTheme = null;
  var mermaidPromise = null;

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

  function collectMermaid() {
    mermaidBlocks = [];
    contentEl.querySelectorAll('pre code.language-mermaid').forEach(function (code) {
      var pre = code.parentNode;
      pre.classList.add('mdv-mermaid');   /* not 'mermaid': avoid auto-init on script load */
      mermaidBlocks.push({ pre: pre, src: code.textContent });
    });
  }

  function renderAllMermaid() {
    var theme = effectiveDark() ? 'dark' : 'default';
    lastMermaidTheme = theme;
    mermaid.initialize({ startOnLoad: false, theme: theme, securityLevel: 'loose' });
    var queue = Promise.resolve();
    mermaidBlocks.forEach(function (b, i) {
      queue = queue.then(function () {
        return mermaid.render('mdv-m-' + i, b.src).then(function (r) {
          b.pre.innerHTML = r.svg;
        }).catch(function (err) {
          b.pre.innerHTML = '<div class="mermaid-error">Mermaid error: ' + escapeHtml(err.message) + '</div>';
        });
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
  function addCopyButtons() {
    contentEl.querySelectorAll('pre').forEach(function (pre) {
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

  function copyText(text, btn) {
    function done(ok) {
      var orig = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { btn.textContent = orig; }, 1500);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(legacyCopy(text)); });
    } else {
      done(legacyCopy(text));
    }
  }

  function render(text) {
    contentEl.innerHTML = marked.parse(text);
    contentEl.querySelectorAll('pre code').forEach(function (el) {
      if (el.classList.contains('language-mermaid')) return;
      hljs.highlightElement(el);
    });
    collectMermaid();
    enhanceHeadings();
    addCopyButtons();
    apply();
  }
  function fail(msg) {
    contentEl.textContent = msg;
    apply();
  }

  marked.setOptions({ gfm: true, breaks: false, pedantic: false });

  var src = params.get('src');
  if (!src) {
    fail('Usage: viewer.html?src=published/foo.md');
  } else {
    fetch(src)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(render)
      .catch(function (err) { fail('Failed to load "' + src + '": ' + err.message); });
  }

  apply();
  mq.addEventListener('change', apply);
})();
