/* ── Article Page JS ──────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '/api/articles.php';

  async function init() {
    await loadSiteConfig();

    const params = new URLSearchParams(location.search);
    const id     = params.get('id') || params.get('slug');

    if (!id) { showError(); return; }

    try {
      const res     = await fetch(`${API}?id=${encodeURIComponent(id)}`);
      if (!res.ok)  { showError(); return; }
      const article = await res.json();
      renderArticle(article);
      loadRelated(article);
    } catch (e) {
      showError();
    }

    setupSearch();
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  async function loadSiteConfig() {
    try {
      const res = await fetch('/api/articles.php?action=config');
      if (!res.ok) return;
      const config = await res.json();
      if (config.siteName) {
        document.getElementById('site-logo').textContent = config.siteName;
      }
      if (config.siteName) {
        const footer = document.getElementById('footer-text');
        if (footer) footer.textContent = `© ${new Date().getFullYear()} ${config.siteName}. 保留所有权利.`;
      }
    } catch (e) { /* ignore */ }
  }

  // ── Render Article ────────────────────────────────────────────────────────
  function renderArticle(a) {
    document.title = a.title + ' - 我的博客';

    // Header
    const catEl = document.getElementById('art-category');
    if (a.category) { catEl.textContent = a.category; catEl.style.display = ''; }

    document.getElementById('art-title').textContent = a.title;

    // Meta
    const meta = document.getElementById('art-meta');
    meta.innerHTML = `
      <span>${formatDate(a.createdAt)}</span>
      ${a.category ? `<span>分类：<a href="index.html?cat=${encodeURIComponent(a.category)}">${esc(a.category)}</a></span>` : ''}`;

    // Tags
    const tagsEl = document.getElementById('art-tags');
    if (a.tags && a.tags.length) {
      tagsEl.innerHTML = a.tags.map(t =>
        `<a href="index.html?q=${encodeURIComponent(t)}" class="tag">${esc(t)}</a>`
      ).join('');
    }

    // Cover image
    if (a.coverImage) {
      const img = document.getElementById('art-cover');
      img.src = a.coverImage;
      img.alt = a.title;
      img.style.display = '';
    }

    // Content
    document.getElementById('art-content').innerHTML = a.content || '';

    // Build ToC
    buildToc();

    // AFS
    const afs = a.afs || {};
    renderTermsGroup(1, afs.relatedTermsGroup1 || [], a.id, afs);
    renderTermsGroup(2, afs.relatedTermsGroup2 || [], a.id, afs);

    // Show article
    document.getElementById('article-loading').style.display = 'none';
    document.getElementById('article-body').style.display = '';
  }

  // ── Terms Group + AFS Ad ──────────────────────────────────────────────────
  function renderTermsGroup(groupNum, terms, articleId, afs) {
    const chipsEl = document.getElementById(`terms-group-${groupNum}`);
    const adEl    = document.getElementById(`afs-container-${groupNum}`);

    // Filter out empty terms
    const filtered = (terms || []).filter(t => t && t.trim());

    if (!filtered.length) {
      document.getElementById(`afs-section-${groupNum}`).style.display = 'none';
      return;
    }

    // Render chips
    chipsEl.innerHTML = filtered.map(term => `
      <a class="search-chip"
         href="results.html?q=${encodeURIComponent(term)}&aid=${encodeURIComponent(articleId)}"
         target="_self">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        ${esc(term)}
      </a>`).join('');

    // Render AFS ad for first term in group (representative query)
    const pubId   = afs.publisherId  || '';
    const styleId = afs.styleId      || '';

    if (pubId && styleId && filtered[0]) {
      adEl.classList.add('loaded');
      adEl.innerHTML = ''; // clear placeholder
      injectAfsAd(adEl.id, pubId, styleId, filtered[0]);
    } else {
      adEl.textContent = '[ Google AFS 广告位 — 请在管理后台配置 Publisher ID 和 Style ID ]';
    }
  }

  // ── Inject AFS Ad ─────────────────────────────────────────────────────────
  function injectAfsAd(containerId, pubId, styleId, query) {
    const tryLoad = () => {
      if (window.google && window.google.ads && window.google.ads.search && window.google.ads.search.Ads) {
        try {
          window.google.ads.search.Ads(
            { pubId: pubId, styleId: styleId, query: query, hl: 'zh-CN' },
            { container: containerId, width: '100%', number: '3' }
          );
        } catch (e) { console.warn('AFS error:', e); }
      } else {
        setTimeout(tryLoad, 500);
      }
    };
    tryLoad();
  }

  // ── Table of Contents ─────────────────────────────────────────────────────
  function buildToc() {
    const content  = document.getElementById('art-content');
    const headings = content.querySelectorAll('h1, h2, h3');
    if (headings.length < 2) return;

    const tocWidget = document.getElementById('toc-widget');
    const tocList   = document.getElementById('toc-list');
    tocWidget.style.display = '';

    headings.forEach((h, i) => {
      const id  = `heading-${i}`;
      h.id      = id;
      const li  = document.createElement('li');
      li.style.paddingLeft = h.tagName === 'H3' ? '1rem' : h.tagName === 'H2' ? '.5rem' : '0';
      li.innerHTML = `<a href="#${id}">${h.textContent}</a>`;
      tocList.appendChild(li);
    });

    // Active link on scroll
    const links = tocList.querySelectorAll('a');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l => l.classList.remove('active'));
          const link = tocList.querySelector(`a[href="#${e.target.id}"]`);
          if (link) link.classList.add('active');
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
        el.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">暂无相关文章</p>';
        return;
      }

      el.innerHTML = articles.map(a => `
        <div class="related-article-item">
          <div class="related-article-info">
            <h4><a href="article.html?id=${esc(a.id)}">${esc(a.title)}</a></h4>
            ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ''}
          </div>
        </div>`).join('');
    } catch (e) {
      el.innerHTML = '';
    }
  }

  // ── Show Error ────────────────────────────────────────────────────────────
  function showError() {
    document.getElementById('article-loading').style.display = 'none';
    document.getElementById('article-error').style.display  = '';
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
