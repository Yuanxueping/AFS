/* ── Homepage JS ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '/api/articles.php';

  let state = {
    page: 1,
    limit: 10,
    category: '',
    search: '',
    totalPages: 1,
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    await loadSiteConfig();

    const params = new URLSearchParams(location.search);
    state.category = params.get('cat') || '';
    state.search   = params.get('q')   || '';
    state.page     = parseInt(params.get('page') || '1', 10);

    if (state.search) {
      document.getElementById('header-search-input').value = state.search;
      document.getElementById('search-info').style.display = 'block';
      document.getElementById('search-info-text').textContent =
        `搜索 "${state.search}" 的结果`;
    }

    await loadArticles();
    setupSearch();
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  async function loadSiteConfig() {
    try {
      const res = await fetch('/api/articles.php?action=config');
      if (!res.ok) return;
      const config = await res.json();
      if (config.siteName) {
        document.title = config.siteName;
        document.getElementById('site-logo').textContent = config.siteName;
      }
      if (config.siteDescription) {
        const el = document.getElementById('site-description');
        if (el) el.textContent = config.siteDescription;
      }
      if (config.siteName) {
        const footer = document.getElementById('footer-text');
        if (footer) footer.textContent = `© ${new Date().getFullYear()} ${config.siteName}. 保留所有权利.`;
      }
      if (config.articlesPerPage) state.limit = config.articlesPerPage;
    } catch (e) { /* ignore */ }
  }

  // ── Load Articles ─────────────────────────────────────────────────────────
  async function loadArticles() {
    const container = document.getElementById('articles-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载文章中…</p></div>';

    const params = new URLSearchParams({
      page:  state.page,
      limit: state.limit,
    });
    if (state.category) params.set('category', state.category);
    if (state.search)   params.set('search', state.search);

    try {
      const res  = await fetch(`${API}?${params}`);
      const data = await res.json();

      state.totalPages = data.totalPages || 1;

      renderCategories(data.categories || {}, data.total || 0);
      renderArticles(data.articles || []);
      renderPagination();
      updateUrl();
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>加载文章失败，请刷新重试。</p></div>';
    }
  }

  // ── Render Articles ───────────────────────────────────────────────────────
  function renderArticles(articles) {
    const container = document.getElementById('articles-container');
    if (!articles.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无文章</p></div>';
      return;
    }

    container.innerHTML = '<div class="articles-grid">' +
      articles.map(articleCard).join('') +
      '</div>';
  }

  function articleCard(a) {
    const date = formatDate(a.createdAt);
    const hasCover = !!a.coverImage;
    const tags = (a.tags || []).slice(0, 3).map(t =>
      `<span class="tag">${esc(t)}</span>`).join('');

    return `
      <article class="article-card${hasCover ? ' has-cover' : ''}">
        ${hasCover ? `<img class="card-cover" src="${esc(a.coverImage)}" alt="${esc(a.title)}" loading="lazy">` : ''}
        <div class="card-body">
          <div class="card-meta">
            ${a.category ? `<span class="badge">${esc(a.category)}</span>` : ''}
            <span>${date}</span>
          </div>
          <h2 class="card-title">
            <a href="article.html?id=${esc(a.id)}">${esc(a.title)}</a>
          </h2>
          ${a.excerpt ? `<p class="card-excerpt">${esc(a.excerpt)}</p>` : ''}
          ${tags ? `<div class="card-tags">${tags}</div>` : ''}
          <a href="article.html?id=${esc(a.id)}" class="read-more">阅读全文</a>
        </div>
      </article>`;
  }

  // ── Render Categories ─────────────────────────────────────────────────────
  function renderCategories(categories, total) {
    const list = document.getElementById('category-list');
    const totalCount = document.getElementById('total-count');
    if (totalCount) totalCount.textContent = total;

    // Keep the "all" item, rebuild rest
    const allItem = list.querySelector('li:first-child');
    const allLink = allItem.querySelector('a');
    allLink.classList.toggle('active', !state.category);

    // Remove existing category items
    Array.from(list.querySelectorAll('li:not(:first-child)')).forEach(li => li.remove());

    Object.entries(categories).sort((a,b) => b[1] - a[1]).forEach(([cat, count]) => {
      const li = document.createElement('li');
      const active = state.category === cat;
      li.innerHTML = `<a href="#" data-cat="${esc(cat)}" class="${active ? 'active' : ''}">
        ${esc(cat)} <span class="cat-count">${count}</span></a>`;
      list.appendChild(li);
    });

    list.addEventListener('click', e => {
      const link = e.target.closest('a[data-cat]');
      if (!link) return;
      e.preventDefault();
      state.category = link.dataset.cat;
      state.page = 1;
      loadArticles();
    });
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function renderPagination() {
    const container = document.getElementById('pagination-container');
    if (state.totalPages <= 1) { container.innerHTML = ''; return; }

    let html = '';
    html += `<button ${state.page <= 1 ? 'disabled' : ''} data-page="${state.page - 1}">‹ 上一页</button>`;

    const pages = buildPageRange(state.page, state.totalPages);
    pages.forEach(p => {
      if (p === '…') {
        html += `<button disabled>…</button>`;
      } else {
        html += `<button class="${p === state.page ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }
    });

    html += `<button ${state.page >= state.totalPages ? 'disabled' : ''} data-page="${state.page + 1}">下一页 ›</button>`;
    container.innerHTML = html;

    container.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.page = parseInt(btn.dataset.page, 10);
        loadArticles();
        window.scrollTo(0, 0);
      });
    });
  }

  function buildPageRange(current, total) {
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    if (current <= 4) return [1,2,3,4,5,'…',total];
    if (current >= total - 3) return [1,'…',total-4,total-3,total-2,total-1,total];
    return [1,'…',current-1,current,current+1,'…',total];
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function setupSearch() {
    const input = document.getElementById('header-search-input');
    const btn   = document.getElementById('header-search-btn');
    const doSearch = () => {
      state.search   = input.value.trim();
      state.page     = 1;
      state.category = '';
      if (state.search) {
        document.getElementById('search-info').style.display = 'block';
        document.getElementById('search-info-text').textContent =
          `搜索 "${state.search}" 的结果`;
      } else {
        document.getElementById('search-info').style.display = 'none';
      }
      loadArticles();
    };
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  }

  // ── URL Sync ──────────────────────────────────────────────────────────────
  function updateUrl() {
    const params = new URLSearchParams();
    if (state.page > 1)    params.set('page', state.page);
    if (state.category)    params.set('cat',  state.category);
    if (state.search)      params.set('q',    state.search);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
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
