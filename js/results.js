/* ── Results Page JS ──────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '/api/articles.php';

  async function init() {
    // Read URL params set when user clicked a related search term on article page:
    //   ?q=QUERY&sid=STYLE_ID&cid=CHANNEL_ID&aid=ARTICLE_ID
    const params    = new URLSearchParams(location.search);
    const query     = params.get('q')   || '';
    const styleId   = params.get('sid') || '';
    const channelId = params.get('cid') || '';
    const aid       = params.get('aid') || '';

    document.getElementById('header-search-input').value = query;
    document.getElementById('query-display').textContent = query || '(no query)';
    document.title = `"${query}" — Search Results`;

    // Load site config for pubId and site name
    const cfg = await loadSiteConfig();
    const pubId     = cfg.afsPublisherId || '';
    const fbPixelId = params.get('fbpx') || cfg.facebookPixelId || '';
    const ttPixelId = params.get('ttpx') || cfg.tiktokPixelId   || '';

    initPixels(fbPixelId, ttPixelId);
    if (query) pixelEvent('Search', { search_string: query });

    // Fire AFS ad immediately (don't wait for article fetch)
    fireAfsAd(pubId, styleId, channelId, query);

    // Fetch source article for related articles list + sidebar terms
    let sourceArticle = null;
    if (aid) {
      try {
        const r = await fetch(`${API}?id=${encodeURIComponent(aid)}`);
        if (r.ok) sourceArticle = await r.json();
      } catch { /* ignore */ }
    }

    await loadRelatedArticles(sourceArticle, query);

    if (sourceArticle) {
      renderMoreTerms(sourceArticle, styleId, channelId);
    }

    document.getElementById('results-loading').style.display = 'none';
    document.getElementById('results-body').style.display    = '';

    setupSearch();
  }

  // ── Fire _googCsa AFS Ad ──────────────────────────────────────────────────
  function fireAfsAd(pubId, styleId, channelId, query) {
    const adSection = document.getElementById('results-ad-section');

    if (!pubId || !styleId || !query) {
      // Not configured — hide the ad section
      adSection.style.display = 'none';
      return;
    }

    // Build resultsPageBaseUrl for any "More searches" links the ad unit generates
    const baseHref = window.location.href.replace(/\/[^/]*(\?.*)?$/, '/');
    const rsParams = new URLSearchParams({ sid: styleId });
    if (channelId) rsParams.set('cid', channelId);
    const resultsPageBaseUrl = `${baseHref}results.html?${rsParams}`;

    const pageOptions = {
      pubId,
      query,
      styleId,
      adsafe: 'low',
      adType: 'text',
      resultsPageBaseUrl,
      resultsPageQueryParam: 'q',
    };
    if (channelId) pageOptions.channel = channelId;

    _googCsa('ads', pageOptions, { container: 'afscontainer1', number: 3, width: '100%' });

    // Pixel: detect ad click via window focus loss
    var adClicked = false;
    window.addEventListener('blur', function onAdBlur() {
      if (adClicked) return;
      adClicked = true;
      window.removeEventListener('blur', onAdBlur);
      pixelEvent('Lead', { search_string: query });
    });
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  async function loadSiteConfig() {
    let cfg = {};
    try {
      const res = await fetch('/api/articles.php?action=config');
      if (res.ok) cfg = await res.json();
    } catch { /* ignore */ }
    const name = cfg.siteName || nameFromDomain();
    document.querySelectorAll('.logo-text, #footer-site-name')
      .forEach(el => el && (el.textContent = name));
    const footer = document.getElementById('footer-text');
    if (footer) footer.textContent = `© ${new Date().getFullYear()} ${name}. All rights reserved.`;
    return cfg;
  }

  function nameFromDomain() {
    const h = window.location.hostname.replace(/^www\./, '');
    const parts = h.split('.');
    const base = parts.length >= 2 ? parts.slice(0, -1).join('') : h;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  // ── Related Articles ──────────────────────────────────────────────────────
  async function loadRelatedArticles(sourceArticle, query) {
    const el = document.getElementById('related-articles-main');

    const safeFetch = async (params) => {
      try {
        const res  = await fetch(`${API}?${params}`);
        const data = await res.json();
        let list = (data.articles || []);
        if (sourceArticle) list = list.filter(a => a.id !== sourceArticle.id);
        return list;
      } catch { return []; }
    };

    // Try category match first, then keyword search, then all recent articles
    let articles = [];
    if (sourceArticle?.category) {
      articles = await safeFetch(new URLSearchParams({ page: 1, limit: 20, category: sourceArticle.category }));
    }
    if (!articles.length && query) {
      articles = await safeFetch(new URLSearchParams({ page: 1, limit: 20, search: query }));
    }
    if (!articles.length) {
      articles = await safeFetch(new URLSearchParams({ page: 1, limit: 20 }));
    }

    const subtitleEl = document.getElementById('results-subtitle');

    if (!articles.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;padding:.75rem 0;">No articles found.</p>';
      if (subtitleEl) subtitleEl.textContent = '';
      return;
    }

    if (subtitleEl) subtitleEl.textContent =
      `${articles.length} related article${articles.length !== 1 ? 's' : ''} found`;

    el.innerHTML = articles.slice(0, 10).map((a, i) => `
      <div class="related-article-item">
        <span class="related-article-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="related-article-info">
          <h4><a href="article.html?id=${esc(a.id)}">${esc(a.title)}</a></h4>
          ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ''}
          <div style="margin-top:.3rem;">
            ${a.category ? `<span class="badge" style="--cat-color:#3b82f6;--cat-bg:#eff6ff;">${esc(a.category)}</span>` : ''}
            <span style="font-size:.75rem;color:var(--text-light);margin-left:.4rem;">${formatDate(a.createdAt)}</span>
          </div>
        </div>
      </div>`).join('');
  }

  // ── Sidebar: More Terms ───────────────────────────────────────────────────
  // Shows other search terms from the source article so users can keep exploring.
  // Carries sid/cid forward so every click keeps the AFS attribution chain intact.
  function renderMoreTerms(article, styleId, channelId) {
    const afs = article.afs || {};
    const allTerms = [
      ...(afs.relatedTermsGroup1 || []),
      ...(afs.relatedTermsGroup2 || []),
    ].filter(t => t && t.trim());

    if (!allTerms.length) return;

    const widget = document.getElementById('more-terms-widget');
    const chips  = document.getElementById('more-terms-chips');
    widget.style.display = '';

    const baseParams = new URLSearchParams({ aid: article.id, sid: styleId });
    if (channelId) baseParams.set('cid', channelId);

    chips.innerHTML = allTerms.map(term => `
      <a class="search-chip"
         href="results.html?q=${encodeURIComponent(term)}&${baseParams}"
         style="justify-content:flex-start;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             style="width:12px;height:12px;flex-shrink:0;">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        ${esc(term)}
      </a>`).join('');
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
