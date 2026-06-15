/* ── Article Page JS ──────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '/api/articles.php';
  let siteConfig = {};

  async function init() {
    await loadSiteConfig();

    const params    = new URLSearchParams(location.search);
    const id        = params.get('id') || params.get('slug');

    if (!id) { showError(); return; }

    try {
      const res = await fetch(`${API}?id=${encodeURIComponent(id)}`);
      if (!res.ok) { showError(); return; }
      const article = await res.json();
      renderArticle(article, params);
      loadRelated(article);
    } catch {
      showError();
    }

    setupSearch();
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  async function loadSiteConfig() {
    try {
      const res = await fetch('/api/articles.php?action=config');
      if (!res.ok) return;
      siteConfig = await res.json();
    } catch { /* ignore */ }
    const name = siteConfig.siteName || nameFromDomain();
    document.querySelectorAll('.logo-text, #footer-site-name')
      .forEach(el => el && (el.textContent = name));
    const footer = document.getElementById('footer-text');
    if (footer) footer.textContent = `© ${new Date().getFullYear()} ${name}. All rights reserved.`;
    if (siteConfig.googleAnalyticsId) injectGA(siteConfig.googleAnalyticsId);
  }

  function injectGA(id) {
    if (document.getElementById('ga-script')) return;
    const s = document.createElement('script');
    s.id = 'ga-script';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', id);
  }

  function nameFromDomain() {
    const h = window.location.hostname.replace(/^www\./, '');
    const parts = h.split('.');
    const base = parts.length >= 2 ? parts.slice(0, -1).join('') : h;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  // ── Render Article ────────────────────────────────────────────────────────
  function renderArticle(a, params) {
    params = params || new URLSearchParams();
    const siteName = siteConfig.siteName || document.querySelector('#site-logo .logo-text')?.textContent || '';
    document.title = siteName ? `${a.title} — ${siteName}` : a.title;

    // Category badge
    const catEl = document.getElementById('art-category');
    if (a.category) {
      catEl.textContent = a.category;
      catEl.style.display = '';
      const { color, bg } = catStyle(a.category);
      catEl.style.setProperty('--cat-color', color);
      catEl.style.setProperty('--cat-bg', bg);
    }

    document.getElementById('art-title').textContent = a.title;

    document.getElementById('art-meta').innerHTML = `
      <span>${formatDate(a.createdAt)}</span>
      ${a.category
        ? `<span>in <a href="index.html?cat=${encodeURIComponent(a.category)}">${esc(a.category)}</a></span>`
        : ''}`;

    const tagsEl = document.getElementById('art-tags');
    if (a.tags && a.tags.length) {
      tagsEl.innerHTML = a.tags.map(t =>
        `<a href="index.html?q=${encodeURIComponent(t)}" class="tag">${esc(t)}</a>`
      ).join('');
    }

    if (a.coverImage) {
      const img = document.getElementById('art-cover');
      img.src = a.coverImage;
      img.alt = a.title;
      img.style.display = '';
    }

    // Set content
    const contentEl = document.getElementById('art-content');
    contentEl.innerHTML = a.content || '';

    // Priority for all IDs: URL param > article setting > site default
    const urlParams     = params;
    const afs           = a.afs || {};
    const pubId         = siteConfig.afsPublisherId || '';
    const styleId       = urlParams.get('sid')   || afs.styleId         || siteConfig.defaultAfsStyleId   || '';
    const channelId     = urlParams.get('cid')   || afs.channelId       || siteConfig.defaultAfsChannelId || '';
    const fbPixelId     = urlParams.get('fbpx')  || afs.facebookPixelId || siteConfig.facebookPixelId     || '';
    const ttPixelId     = urlParams.get('ttpx')  || afs.tiktokPixelId   || siteConfig.tiktokPixelId       || '';

    injectAndFireAfs(contentEl, pubId, styleId, channelId, a.id, fbPixelId, ttPixelId, a.title, urlParams);

    initPixels(fbPixelId, ttPixelId);

    buildToc();

    document.getElementById('article-loading').style.display = 'none';
    document.getElementById('article-body').style.display = '';
  }

  // ── Inject AFS Slots + Fire _googCsa ─────────────────────────────────────
  function injectAndFireAfs(contentEl, pubId, styleId, channelId, articleId, fbPixelId, ttPixelId, articleTitle, urlParams) {
    const slot1 = document.getElementById('relatedsearches1');
    const slot2 = document.getElementById('relatedsearches2');

    const paragraphs = contentEl.querySelectorAll(':scope > p');
    if (paragraphs.length < 2) return;

    // Move slot1 after the first paragraph
    paragraphs[0].after(slot1);
    // Move slot2 before the last paragraph
    paragraphs[paragraphs.length - 1].before(slot2);

    // Only fire AFS if pubId is configured for this site
    if (!pubId || !styleId) return;

    slot1.style.display = '';
    slot2.style.display = '';

    // Build resultsPageBaseUrl — carries styleId, channelId and articleId
    // so the results page can load related articles and fire AFS ads correctly.
    const baseHref = window.location.href.replace(/\/[^/]*(\?.*)?$/, '/');
    const rsParams = new URLSearchParams({ sid: styleId });
    if (channelId)  rsParams.set('cid', channelId);
    if (articleId)  rsParams.set('aid', articleId);
    if (fbPixelId)  rsParams.set('fbpx', fbPixelId);
    if (ttPixelId)  rsParams.set('ttpx', ttPixelId);
    const resultsPageBaseUrl = `${baseHref}results.html?${rsParams}`;

    // pageOptions shared by both relatedsearch blocks
    // ignoredPageParams: tell AFS to ignore tracking/attribution params
    // so all URL variants are treated as the same article page.
    // terms: optional hint list from URL param (Google may or may not use it)
    const terms = urlParams.get('terms') || undefined;

    // referrerAdCreative: from URL ?rac=, or fall back to "title | Learn More"
    const rac = urlParams.get('rac');
    const referrerAdCreative = rac || (articleTitle ? `${articleTitle} | Learn More` : undefined);
    console.log('[AFS] rac param:', rac, '| referrerAdCreative:', referrerAdCreative);

    const pageOptions = {
      pubId,
      styleId,
      relatedSearchTargeting: 'content',
      resultsPageBaseUrl,
      resultsPageQueryParam: 'q',
      ignoredPageParams: [...urlParams.keys()]
        .filter(k => k !== 'id' && k !== 'slug').join(',') || undefined,
    };
    if (channelId)           pageOptions.channel              = channelId;
    if (terms)               pageOptions.terms                = terms;
    if (referrerAdCreative)  pageOptions.referrerAdCreative   = referrerAdCreative;

    _googCsa('relatedsearch', pageOptions,
      { container: 'relatedsearches1', relatedSearches: 5 },
      { container: 'relatedsearches2', relatedSearches: 5 }
    );

    // Pixel: related search slots visible
    pixelEvent('ViewContent', { content_name: document.title });

    // Pixel: fire Search only when blur happens with mouse over an AFS slot
    var searchClicked = false;
    var lastX = -1, lastY = -1;
    document.addEventListener('mousemove', function(e) { lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('blur', function onAfsBlur() {
      if (searchClicked) return;
      var over = [slot1, slot2].some(function(slot) {
        var r = slot.getBoundingClientRect();
        return lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom;
      });
      if (!over) return;
      searchClicked = true;
      window.removeEventListener('blur', onAfsBlur);
      pixelEvent('Search');
    });
  }

  // ── Table of Contents ─────────────────────────────────────────────────────
  function buildToc() {
    const contentEl = document.getElementById('art-content');
    const headings  = contentEl.querySelectorAll('h1, h2, h3');
    if (headings.length < 2) return;

    const tocWidget = document.getElementById('toc-widget');
    const tocList   = document.getElementById('toc-list');
    tocWidget.style.display = '';

    headings.forEach((h, i) => {
      h.id = `heading-${i}`;
      const li = document.createElement('li');
      li.style.paddingLeft = h.tagName === 'H3' ? '1rem' : h.tagName === 'H2' ? '.5rem' : '0';
      li.innerHTML = `<a href="#${h.id}">${h.textContent}</a>`;
      tocList.appendChild(li);
    });

    const links = tocList.querySelectorAll('a');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l => l.classList.remove('active'));
          tocList.querySelector(`a[href="#${e.target.id}"]`)?.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    headings.forEach(h => observer.observe(h));
  }

  // ── Related Articles ──────────────────────────────────────────────────────
  async function loadRelated(current) {
    const el = document.getElementById('related-articles-list');
    try {
      const params = new URLSearchParams({ page: 1, limit: 20 });
      if (current.category) params.set('category', current.category);
      const res  = await fetch(`${API}?${params}`);
      const data = await res.json();

      const articles = (data.articles || [])
        .filter(a => a.id !== current.id)
        .slice(0, 6);

      if (!articles.length) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">No related articles found.</p>';
        return;
      }

      el.innerHTML = articles.map(a => `
        <div class="related-article-item">
          <div class="related-article-info">
            <h4><a href="article.html?id=${esc(a.id)}">${esc(a.title)}</a></h4>
            ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ''}
          </div>
        </div>`).join('');
    } catch {
      el.innerHTML = '';
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function setupSearch() {
    const input = document.getElementById('header-search-input');
    const btn   = document.getElementById('header-search-btn');
    const go = () => {
      const q = input.value.trim();
      if (q) window.location.href = `index.html?q=${encodeURIComponent(q)}`;
    };
    btn.addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  // ── Show Error ────────────────────────────────────────────────────────────
  function showError() {
    document.getElementById('article-loading').style.display = 'none';
    document.getElementById('article-error').style.display  = '';
  }

  // ── Pixel Tracking ───────────────────────────────────────────────────────
  function initPixels(fbId, ttId) {
    if (fbId) initFbPixel(fbId);
    if (ttId) initTtPixel(ttId);
  }

  function initFbPixel(id) {
    if (window.fbq) return;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq('init', id);
    fbq('track', 'PageView');
  }

  function initTtPixel(id) {
    if (window.ttq) return;
    /* eslint-disable */
    !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(id);ttq.page()}(window,document,'ttq');
    /* eslint-enable */
  }

  function pixelEvent(name, data) {
    try { if (window.fbq) fbq('track', name, data || {}); } catch(e) {}
    try { if (window.ttq) ttq.track(name, data || {}); } catch(e) {}
  }

  // ── Category Colors ───────────────────────────────────────────────────────
  const CAT_COLORS = {
    'technology':  { color: '#3b82f6', bg: '#eff6ff' },
    'programming': { color: '#8b5cf6', bg: '#f5f3ff' },
    'health':      { color: '#10b981', bg: '#ecfdf5' },
    'finance':     { color: '#f59e0b', bg: '#fffbeb' },
    'career':      { color: '#ef4444', bg: '#fef2f2' },
    'travel':      { color: '#06b6d4', bg: '#ecfeff' },
    'food':        { color: '#f97316', bg: '#fff7ed' },
    'science':     { color: '#6366f1', bg: '#eef2ff' },
    'lifestyle':   { color: '#ec4899', bg: '#fdf2f8' },
    'default':     { color: '#64748b', bg: '#f8fafc' },
  };
  function catStyle(name) {
    return CAT_COLORS[name?.toLowerCase().replace(/\s+/g, '')] || CAT_COLORS.default;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return iso; }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  init();
})();
