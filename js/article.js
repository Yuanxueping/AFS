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
      const res = await fetch(`${API}?id=${encodeURIComponent(id)}`);
      if (!res.ok) { showError(); return; }
      const article = await res.json();
      renderArticle(article);
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
      const cfg = await res.json();
      if (cfg.siteName) {
        document.querySelectorAll('#site-logo .logo-text, #footer-site-name')
          .forEach(el => el && (el.textContent = cfg.siteName));
        const footer = document.getElementById('footer-text');
        if (footer) footer.textContent = `© ${new Date().getFullYear()} ${cfg.siteName}. All rights reserved.`;
      }
    } catch { /* ignore */ }
  }

  // ── Render Article ────────────────────────────────────────────────────────
  function renderArticle(a) {
    document.title = `${a.title} — ${document.querySelector('#site-logo .logo-text')?.textContent || 'Blog'}`;

    const afs = a.afs || {};
    const hasAfs = !!(afs.publisherId && afs.publisherId.trim() &&
                      afs.publisherId !== 'pub-XXXXXXXXXXXXXXXX');

    // Category badge
    const catEl = document.getElementById('art-category');
    if (a.category) {
      catEl.textContent = a.category;
      catEl.style.display = '';
      const { color, bg } = catStyle(a.category);
      catEl.style.cssText += `;--cat-color:${color};--cat-bg:${bg}`;
    }

    document.getElementById('art-title').textContent = a.title;

    // Meta
    document.getElementById('art-meta').innerHTML = `
      <span>${formatDate(a.createdAt)}</span>
      ${a.category
        ? `<span>in <a href="index.html?cat=${encodeURIComponent(a.category)}">${esc(a.category)}</a></span>`
        : ''}`;

    // Tags
    const tagsEl = document.getElementById('art-tags');
    if (a.tags && a.tags.length) {
      tagsEl.innerHTML = a.tags.map(t =>
        `<a href="index.html?q=${encodeURIComponent(t)}" class="tag">${esc(t)}</a>`
      ).join('');
    }

    // Cover
    if (a.coverImage) {
      const img = document.getElementById('art-cover');
      img.src = a.coverImage;
      img.alt = a.title;
      img.style.display = '';
    }

    // Set content
    const contentEl = document.getElementById('art-content');
    contentEl.innerHTML = a.content || '';

    // Inject AFS slots into content at correct positions
    injectAfsSlots(contentEl, a, afs, hasAfs);

    // Build ToC
    buildToc();

    // Show article
    document.getElementById('article-loading').style.display = 'none';
    document.getElementById('article-body').style.display = '';
  }

  // ── Inject AFS Slots Into Content ─────────────────────────────────────────
  function injectAfsSlots(contentEl, article, afs, hasAfs) {
    const paragraphs = contentEl.querySelectorAll(':scope > p');
    if (paragraphs.length < 2) return; // not enough paragraphs to inject

    const slot1 = document.getElementById('afs-slot-1');
    const slot2 = document.getElementById('afs-slot-2');

    // Position slot 1: after first <p>
    paragraphs[0].after(slot1);

    // Position slot 2: before last <p>
    paragraphs[paragraphs.length - 1].before(slot2);

    if (!hasAfs) {
      // No AFS configured — keep slots hidden (placeholder space only)
      return;
    }

    // AFS is configured — render both groups
    const sid = afs.styleId   || '';
    const cid = afs.channelId || '';
    const pid = afs.publisherId;

    const group1 = (afs.relatedTermsGroup1 || []).filter(t => t && t.trim());
    const group2 = (afs.relatedTermsGroup2 || []).filter(t => t && t.trim());

    if (group1.length) {
      renderTermsGroup(slot1, 'terms-group-1', 'afs-container-1', group1, article.id, pid, sid, cid);
    }
    if (group2.length) {
      renderTermsGroup(slot2, 'terms-group-2', 'afs-container-2', group2, article.id, pid, sid, cid);
    }
  }

  // ── Render a Terms Group ───────────────────────────────────────────────────
  function renderTermsGroup(slotEl, chipsId, adId, terms, articleId, pubId, styleId, channelId) {
    // Build URL params that carry AFS identifiers to results page
    const baseParams = new URLSearchParams({
      aid: articleId,
      sid: styleId,
      ...(channelId ? { cid: channelId } : {}),
    });

    const chipsEl = document.getElementById(chipsId);
    chipsEl.innerHTML = terms.map(term => `
      <a class="search-chip"
         href="results.html?q=${encodeURIComponent(term)}&${baseParams}"
         target="_self">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        ${esc(term)}
      </a>`).join('');

    // Inject AFS ad using first term as representative query
    const adEl = document.getElementById(adId);
    adEl.classList.add('loaded');
    injectAfsAd(adId, pubId, styleId, channelId, terms[0]);

    slotEl.style.display = '';
  }

  // ── Inject AFS Ad ─────────────────────────────────────────────────────────
  function injectAfsAd(containerId, pubId, styleId, channelId, query) {
    const tryLoad = () => {
      if (window.google?.ads?.search?.Ads) {
        try {
          const pageOpts = { pubId, styleId, query, hl: 'en' };
          if (channelId) pageOpts.channel = channelId;
          window.google.ads.search.Ads(pageOpts, {
            container: containerId,
            width: '100%',
            number: '3',
          });
        } catch (e) { console.warn('AFS error:', e); }
      } else {
        setTimeout(tryLoad, 500);
      }
    };
    tryLoad();
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

  // ── Category Color ────────────────────────────────────────────────────────
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
    return CAT_COLORS[name.toLowerCase().replace(/\s+/g, '')] || CAT_COLORS.default;
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
