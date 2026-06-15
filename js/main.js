/* ── Homepage JS ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '/api/articles.php';

  /* Category → accent color mapping */
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
    if (!name) return CAT_COLORS.default;
    const key = name.toLowerCase().replace(/\s+/g, '');
    return CAT_COLORS[key] || CAT_COLORS.default;
  }

  let state = {
    page: 1,
    limit: 9,
    category: '',
    search: '',
    totalPages: 1,
    totalArticles: 0,
    allCategories: {},
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    await loadSiteConfig();

    const params = new URLSearchParams(location.search);
    state.category = params.get('cat') || '';
    state.search   = params.get('q')   || '';
    state.page     = parseInt(params.get('page') || '1', 10);

    if (state.search) {
      document.getElementById('hero-search-input').value = state.search;
      showSearchNotice(state.search);
    }

    await loadArticles();
    setupSearch();
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  async function loadSiteConfig() {
    try {
      const res = await fetch('/api/articles.php?action=config');
      if (!res.ok) return;
      const cfg = await res.json();
      // Site name: config value if set, otherwise derive from domain
      const name = cfg.siteName || nameFromDomain();
      document.querySelectorAll('.logo-text, #footer-site-name')
        .forEach(el => el && (el.textContent = name));
      document.title = name;
      const footer = document.getElementById('footer-text');
      if (footer) footer.textContent = `© ${new Date().getFullYear()} ${name}. All rights reserved.`;
      if (cfg.siteDescription) {
        const el = document.getElementById('hero-subtitle');
        if (el) el.textContent = cfg.siteDescription;
        const fd = document.getElementById('footer-desc');
        if (fd) fd.textContent = cfg.siteDescription;
      }
      if (cfg.articlesPerPage) state.limit = cfg.articlesPerPage;
      if (cfg.googleAnalyticsId) injectGA(cfg.googleAnalyticsId);
    } catch { /* ignore */ }
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

  // ── Load Articles ─────────────────────────────────────────────────────────
  async function loadArticles() {
    const container = document.getElementById('articles-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading articles…</p></div>';

    const params = new URLSearchParams({ page: state.page, limit: state.limit });
    if (state.category) params.set('category', state.category);
    if (state.search)   params.set('search', state.search);

    try {
      const res  = await fetch(`${API}?${params}`);
      const data = await res.json();

      state.totalPages    = data.totalPages || 1;
      state.totalArticles = data.total || 0;
      state.allCategories = data.categories || {};

      renderStats(data.total || 0, Object.keys(data.categories || {}).length);
      renderCategoryBar(data.categories || {});
      renderArticles(data.articles || []);
      renderPagination();
      updateSectionHeading();
      updateUrl();
    } catch {
      container.innerHTML = `<div class="empty-state">
        <div class="icon">⚠️</div>
        <h3>Failed to load articles</h3>
        <p>Please refresh the page and try again.</p>
      </div>`;
    }
  }

  // ── Render Stats ──────────────────────────────────────────────────────────
  function renderStats(total, catCount) {
    const sa = document.getElementById('stat-articles');
    const sc = document.getElementById('stat-categories');
    if (sa) sa.textContent = total;
    if (sc) sc.textContent = catCount;
    const footer = document.getElementById('footer-text');
    if (footer) {
      const siteName = document.querySelector('#footer-site-name')?.textContent || 'The Daily Insight';
      footer.textContent = `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;
    }
  }

  // ── Render Category Bar ───────────────────────────────────────────────────
  function renderCategoryBar(categories) {
    const bar = document.getElementById('category-bar');
    bar.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'cat-pill' + (!state.category ? ' active' : '');
    allBtn.dataset.cat = '';
    allBtn.innerHTML = 'All Posts';
    bar.appendChild(allBtn);

    Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat]) => {
        const { color } = catStyle(cat);
        const btn = document.createElement('button');
        btn.className = 'cat-pill' + (state.category === cat ? ' active' : '');
        btn.dataset.cat = cat;
        btn.innerHTML = `<span class="cat-dot" style="background:${color}"></span>${esc(cat)}`;
        bar.appendChild(btn);
      });

    bar.addEventListener('click', e => {
      const btn = e.target.closest('.cat-pill');
      if (!btn) return;
      state.category = btn.dataset.cat;
      state.page = 1;
      loadArticles();
    });
  }

  // ── Render Articles ───────────────────────────────────────────────────────
  function renderArticles(articles) {
    const container = document.getElementById('articles-container');
    if (!articles.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="icon">📭</div>
        <h3>No articles found</h3>
        <p>${state.search ? `No results for "${esc(state.search)}"` : 'No articles in this category yet.'}</p>
      </div>`;
      return;
    }

    const cards = articles.map((a, i) => articleCard(a, i === 0 && state.page === 1)).join('');
    container.innerHTML = `<div class="articles-grid">${cards}</div>`;
  }

  function articleCard(a, isFeatured) {
    const { color, bg } = catStyle(a.category);
    const date = formatDate(a.createdAt);
    const hasCover = !!a.coverImage;
    const tags = (a.tags || []).slice(0, 2)
      .map(t => `<span class="tag">${esc(t)}</span>`).join('');

    const badge = a.category
      ? `<span class="badge" style="--cat-color:${color};--cat-bg:${bg}">${esc(a.category)}</span>`
      : '';

    const coverHtml = hasCover
      ? `<div class="card-cover-wrap">
           <img class="card-cover" src="${esc(a.coverImage)}" alt="${esc(a.title)}" loading="lazy">
         </div>`
      : '';

    const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>`;

    return `
      <article class="article-card${isFeatured ? ' featured' : ''}"
               style="--cat-color:${color};--cat-bg:${bg}">
        ${isFeatured && hasCover ? coverHtml : (!isFeatured && hasCover ? coverHtml : '')}
        <div class="card-body">
          <div class="card-meta">
            ${badge}
            <span class="card-date">${date}</span>
          </div>
          <h2 class="card-title">
            <a href="article.html?id=${esc(a.id)}">${esc(a.title)}</a>
          </h2>
          ${a.excerpt ? `<p class="card-excerpt">${esc(a.excerpt)}</p>` : ''}
          <div class="card-footer">
            <div class="card-tags">${tags}</div>
            <a href="article.html?id=${esc(a.id)}" class="read-more">
              Read more ${arrowSvg}
            </a>
          </div>
        </div>
      </article>`;
  }

  // ── Section Heading ───────────────────────────────────────────────────────
  function updateSectionHeading() {
    const heading = document.getElementById('section-heading');
    const titleEl = heading?.querySelector('.section-title');
    const countEl = document.getElementById('section-count');
    if (titleEl) {
      titleEl.textContent = state.category
        ? state.category
        : state.search ? `Results for "${state.search}"` : 'Latest Articles';
    }
    if (countEl) {
      countEl.textContent = state.totalArticles > 0
        ? `${state.totalArticles} article${state.totalArticles !== 1 ? 's' : ''}`
        : '';
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function setupSearch() {
    const input = document.getElementById('hero-search-input');
    const btn   = document.getElementById('hero-search-btn');
    const doSearch = () => {
      state.search   = input.value.trim();
      state.page     = 1;
      state.category = '';
      if (state.search) showSearchNotice(state.search);
      else hideSearchNotice();
      loadArticles();
    };
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  }

  function showSearchNotice(q) {
    const el = document.getElementById('search-info');
    const txt = document.getElementById('search-info-text');
    if (el) el.style.display = 'flex';
    if (txt) txt.textContent = `Showing results for "${q}"`;
  }
  function hideSearchNotice() {
    const el = document.getElementById('search-info');
    if (el) el.style.display = 'none';
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function renderPagination() {
    const container = document.getElementById('pagination-container');
    if (state.totalPages <= 1) { container.innerHTML = ''; return; }

    let html = `<button ${state.page <= 1 ? 'disabled' : ''} data-page="${state.page - 1}">← Prev</button>`;
    buildPageRange(state.page, state.totalPages).forEach(p => {
      html += p === '…'
        ? `<button disabled>…</button>`
        : `<button class="${p === state.page ? 'active' : ''}" data-page="${p}">${p}</button>`;
    });
    html += `<button ${state.page >= state.totalPages ? 'disabled' : ''} data-page="${state.page + 1}">Next →</button>`;
    container.innerHTML = html;

    container.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.page = parseInt(btn.dataset.page, 10);
        loadArticles();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function buildPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', current - 1, current, current + 1, '…', total];
  }

  // ── URL Sync ──────────────────────────────────────────────────────────────
  function updateUrl() {
    const params = new URLSearchParams();
    if (state.page > 1)    params.set('page', state.page);
    if (state.category)    params.set('cat', state.category);
    if (state.search)      params.set('q', state.search);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
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
