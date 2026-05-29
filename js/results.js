/* ── Results Page JS ──────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '/api/articles.php';

  async function init() {
    await loadSiteConfig();

    const params  = new URLSearchParams(location.search);
    const query   = params.get('q')   || '';
    const aid     = params.get('aid') || '';

    // Update header search
    document.getElementById('header-search-input').value = query;

    // Display query
    const qDisplay = document.getElementById('query-display');
    qDisplay.textContent = query || '(无关键词)';
    document.title = `${query} - 搜索结果 - 我的博客`;

    // Load source article for AFS config
    let sourceArticle = null;
    if (aid) {
      try {
        const r = await fetch(`${API}?id=${encodeURIComponent(aid)}`);
        if (r.ok) sourceArticle = await r.json();
      } catch (e) { /* ignore */ }
    }

    // Init AFS ad
    const afs       = sourceArticle && sourceArticle.afs ? sourceArticle.afs : {};
    const pubId     = afs.publisherId || '';
    const styleId   = afs.styleId    || '';
    const adEl      = document.getElementById('afs-results-container');

    if (pubId && styleId && query) {
      adEl.classList.add('loaded');
      injectAfsAd('afs-results-container', pubId, styleId, query);
    } else {
      adEl.textContent = '[ Google AFS 广告位 — 请配置 Publisher ID 和 Style ID ]';
      adEl.style.cssText = 'padding:1.5rem;text-align:center;color:var(--text-light);font-size:.8rem;border:1px dashed var(--border);border-radius:.375rem;';
    }

    // Load related articles
    await loadRelatedArticles(sourceArticle, query);

    // Sidebar: show other terms from the source article
    if (sourceArticle && sourceArticle.afs) {
      renderMoreTerms(sourceArticle);
    }

    document.getElementById('results-loading').style.display = 'none';
    document.getElementById('results-body').style.display    = '';

    setupSearch();
  }

  // ── AFS Ad ────────────────────────────────────────────────────────────────
  function injectAfsAd(containerId, pubId, styleId, query) {
    const tryLoad = () => {
      if (window.google && window.google.ads && window.google.ads.search && window.google.ads.search.Ads) {
        try {
          window.google.ads.search.Ads(
            { pubId: pubId, styleId: styleId, query: query, hl: 'zh-CN' },
            { container: containerId, width: '100%', number: '5' }
          );
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

      // Use category of source article for related lookup
      if (sourceArticle && sourceArticle.category) {
        params.set('category', sourceArticle.category);
      } else if (query) {
        params.set('search', query);
      }

      const res  = await fetch(`${API}?${params}`);
      const data = await res.json();

      let articles = (data.articles || []);
      if (sourceArticle) {
        articles = articles.filter(a => a.id !== sourceArticle.id);
      }

      const subtitle = document.getElementById('results-subtitle');

      if (!articles.length) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;padding:1rem 0;">暂无相关文章</p>';
        subtitle.textContent = '';
        return;
      }

      subtitle.textContent = `找到 ${articles.length} 篇相关文章`;

      el.innerHTML = articles.slice(0, 10).map((a, i) => `
        <div class="related-article-item">
          <span class="related-article-num">${String(i + 1).padStart(2, '0')}</span>
          <div class="related-article-info">
            <h4><a href="article.html?id=${esc(a.id)}">${esc(a.title)}</a></h4>
            ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ''}
            <div style="margin-top:.25rem;">
              ${a.category ? `<span class="badge" style="background:var(--primary-light);color:var(--primary);padding:.1rem .45rem;border-radius:2rem;font-size:.72rem;">${esc(a.category)}</span>` : ''}
              <span style="font-size:.75rem;color:var(--text-muted);margin-left:.35rem;">${formatDate(a.createdAt)}</span>
            </div>
          </div>
        </div>`).join('');

    } catch (e) {
      el.innerHTML = '<p style="color:var(--text-muted);">加载失败</p>';
    }
  }

  // ── More Terms Sidebar ────────────────────────────────────────────────────
  function renderMoreTerms(article) {
    const afs    = article.afs || {};
    const allTerms = [
      ...(afs.relatedTermsGroup1 || []),
      ...(afs.relatedTermsGroup2 || []),
    ].filter(t => t && t.trim());

    if (!allTerms.length) return;

    const widget = document.getElementById('more-terms-widget');
    const chips  = document.getElementById('more-terms-chips');
    widget.style.display = '';
    chips.innerHTML = allTerms.map(term => `
      <a class="search-chip"
         href="results.html?q=${encodeURIComponent(term)}&aid=${esc(article.id)}"
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
      const config = await res.json();
      if (config.siteName) {
        document.getElementById('site-logo').textContent = config.siteName;
        const footer = document.getElementById('footer-text');
        if (footer) footer.textContent = `© ${new Date().getFullYear()} ${config.siteName}. 保留所有权利.`;
      }
    } catch (e) { /* ignore */ }
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
      return new Date(iso).toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric'});
    } catch { return iso; }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  init();
})();
