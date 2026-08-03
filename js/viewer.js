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
  if (['light', 'dark', 'auto'].indexOf(params.get('theme')) !== -1) themeMode = params.get('theme');
  var enableToc = params.get('toc') === '1' || params.get('toc') === 'true';
  var VALID_CODES = ['github', 'nord', 'solarized', 'one-dark', 'atlassian'];
  var codeScheme = VALID_CODES.indexOf(params.get('code')) !== -1 ? params.get('code') : 'default';
  var saved = null;
  try { saved = localStorage.getItem('mdv-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark' || saved === 'auto') themeMode = saved;

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
  function addHeadingAnchors() {
    contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function (h) {
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
      contentEl.insertAdjacentHTML('afterbegin',
        '<details class="toc" open><summary>Contents</summary><ul>' + items.join('') + '</ul></details>');
      contentEl.querySelectorAll('.toc a').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          scrollToHeading(a.getAttribute('href').slice(1));
        });
      });
    }
    addHeadingAnchors(headings);
    var hashId = (location.hash || '').slice(1);
    if (hashId) startDeepLink(hashId);
    if (pendingHash) {
      var ph = pendingHash;
      pendingHash = null;
      startDeepLink(ph);
    }
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
    if (e.key === 'Escape' || e.key === 'Esc') closeLightbox();
  });

  function enableImageZoom() {
    contentEl.querySelectorAll('img').forEach(function (img) {
      /* linked images keep the link's own behavior (matches GitHub) */
      if (img.closest('a')) return;
      img.addEventListener('click', function () { openLightbox(img); });
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

  function rewriteAssetPaths() {
    if (!srcDir) return;
    var prefix = srcDir + '/';
    contentEl.querySelectorAll('img[src], a[href], video[src], audio[src], source[src]').forEach(function (el) {
      var attr = el.hasAttribute('src') ? 'src' : 'href';
      var v = el.getAttribute(attr);
      if (!v) return;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(v) || v.indexOf('//') === 0) return;
      el.setAttribute(attr, prefix + v);
    });
  }

  /* Content links open in a new tab: inside the Confluence iframe, navigating
     the frame would lose the page. Fragment links (#...) stay in-frame so the
     viewer can scroll to them (TOC links are fragment links). */
  function setLinkTargets() {
    contentEl.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }

  function render(text) {
    contentEl.innerHTML = marked.parse(text);
    rewriteAssetPaths();
    contentEl.querySelectorAll('pre code').forEach(function (el) {
      if (el.classList.contains('language-mermaid')) return;
      hljs.highlightElement(el);
    });
    collectMermaid();
    enhanceHeadings();
    setLinkTargets();
    enableImageZoom();
    addCopyButtons();
    rendered = true;
    apply();
  }
  function fail(msg) {
    contentEl.textContent = msg;
    apply();
  }

  marked.setOptions({ gfm: true, breaks: false, pedantic: false });
  /* GitHub-style heading ids come from marked-gfm-heading-id (cdnjs). If it
     ever fails to load, marked still emits its own ids, so anchors and the TOC
     keep working. */
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
      .then(render)
      .catch(function (err) { fail('Failed to load "' + src + '": ' + err.message); });
  }

  apply();
  mq.addEventListener('change', apply);
})();
