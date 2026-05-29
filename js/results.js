/* ── Results Page JS ──────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '/api/articles.php';

  async function init() {
    await loadSiteConfig();

    const params    = new URLSearchParams(location.search);
    const query     = params.get('q')   || '';
    const aid       = params.get('aid') || '';
    const styleId   = params.get('sid') || '';   // passed from article chip URL
    const channelId = params.get('cid') || '';   // passed from article chip URL

    // Populate header search
    document.getElementById('header-search-input').value = query;

    // Display query
    document.getElementById('query-display').textContent = query || '(no query)';
    document.title = `"${query}" — Search Results`;

    // Fetch source article (for related articles + sidebar terms + fallback AFS config)
    let sourceArticle = null;
    if (aid) {
      try {
        const r = await fetch(`${API}?id=${encodeURIComponent(aid)}`);
        if (r.ok) sourceArticle = await r.json();
      } catch { /* ignore */ }
    }

    // Resolve AFS credentials:
    // URL params (sid/cid) take priority — they were explicitly passed from the chip click.
    // Fallback to source article's stored AFS config.
    const afs       = sourceArticle?.afs || {};
    const pubId     = afs.publisherId || '';
    const resolvedStyleId   = styleId   || afs.styleId   || '';
    const resolvedChannelId = channelId || afs.channelId || '';

    // Inject AFS ad
    const adSection = document.getElementById('results-ad-section');
    const adEl      = document.getElementById('afs-results-container');

    if (pubId && resolvedStyleId && query) {
      adEl.classList.add('loaded');
      injectAfsAd('afs-results-container', pubId, resolvedStyleId, resolvedChannelId, query);
    } else {
      // No AFS config — hide the ad section entirely
      adSection.style.display = 'none';
    }

    // Load related articles
    await loadRelatedArticles(sourceArticle, query);

    // Sidebar: other terms from source article (carry same sid/cid params)
    if (sourceArticle?.afs) {
      renderMoreTerms(sourceArticle, resolvedStyleId, resolvedChannelId);
    }

    document.getElementById('results-loading').style.display = 'none';
    document.getElementById('results-body').style.display    = '';

    setupSearch();
  }

  // ── AFS Ad ────────────────────────────────────────────────────────────────
  function injectAfsAd(containerId, pubId, styleId, channelId, query) {
    const tryLoad = () => {
      if (window.google?.ads?.search?.Ads) {
        try {
          const pageOpts = { pubId, styleId, query, hl: 'en' };
          if (channelId) pageOpts.channel = channelId;
          window.google.ads.search.Ads(pageOpts, {
            container: containerId,
            width: '100%',
            number: '1',   // results page shows 1 ad
          });
        } catch (e) { console.warn('AFS error:', e); }
      } else {
        setTimeout(tryLoad, 500);
      }
    };
    tryLoad();
  }

  // ── Related Articles ──────────────────────────────────────────────────────
  async function loadRelatedArticles(sourceArticle, query) {
    const el = document.getElementById('related-articles-main');
    try {
      const params = new URLSearchParams({ page: 1, limit: 20 });
      if (sourceArticle?.category) {
        params.set('category', sourceArticle.category);
      } else if (query) {
        params.set('search', query);
      }

      const res  = await fetch(`${API}?${params}`);
      const data = await res.json();
      let articles = (data.articles || []);
      if (sourceArticle) articles = articles.filter(a => a.id !== sourceArticle.id);

      const subtitleEl = document.getElementById('results-subtitle');

      if (!articles.length) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;padding:.75rem 0;">No related articles found.</p>';
        if (subtitleEl) subtitleEl.textContent = '';
        return;
      }

      if (subtitleEl) subtitleEl.textContent = `${articles.length} related article${articles.length !== 1 ? 's' : ''} found`;

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
    } catch {
      el.innerHTML = '<p style="color:var(--text-muted);">Failed to load articles.</p>';
    }
  }

  // ── Sidebar: More Terms ───────────────────────────────────────────────────
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

    // Build base params (carry sid/cid forward)
    const baseParams = new URLSearchParams({ aid: article.id, sid: styleId });
    if (channelId) baseParams.set('cid', channelId);

    chips.innerHTML = allTerms.map(term => `
      <a class="search-chip"
         href="results.html?q=${encodeURIComponent(term)}&${baseParams}"
         style="justify-content:flex-start;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             style="width:12px;height:12px;">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        ${esc(term)}
      </a>`).join('');
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  async function loadSiteConfig() {
    try {
      const res = await fetch('/api/articles.php?action=config');
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg.siteName) {
        document.querySelectorAll('#site-logo .logo-text, #footer-site-name')
          .forEach(el => el && (el.textContent = cfg.siteName));
        const footer = document.getElementById('footer-text');
        if (footer) footer.textContent = `© ${new Date().getFullYear()} ${cfg.siteName}. All rights reserved.`;
      }
    } catch { /* ignore */ }
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
