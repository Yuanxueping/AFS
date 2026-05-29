/* ── Admin Panel JS ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API_AUTH     = '/api/auth.php';
  const API_ARTICLES = '/api/articles.php';

  let allArticles    = [];
  let filteredArticles = [];
  let editingId      = null;
  let htmlMode       = false;
  let confirmCallback = null;
  let siteConfig     = {};

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  async function init() {
    const authRes  = await apiFetch(API_AUTH + '?action=check');
    if (authRes && authRes.authenticated) {
      showAdmin();
    } else {
      showLogin();
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  function showLogin() {
    document.getElementById('login-page').style.display = '';
    document.getElementById('admin-page').style.display = 'none';

    const btn   = document.getElementById('login-btn');
    const input = document.getElementById('login-password');

    const doLogin = async () => {
      const password = input.value.trim();
      if (!password) return;
      btn.disabled = true;
      btn.textContent = '登录中…';

      const res = await apiFetch(API_AUTH, { method: 'POST', body: { password } });
      btn.disabled = false;
      btn.textContent = '登录';

      if (res && res.success) {
        showAdmin();
      } else {
        showAlert('login-alert', 'danger', res?.message || '密码错误，请重试');
      }
    };

    btn.addEventListener('click', doLogin);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }

  // ── Admin Shell ───────────────────────────────────────────────────────────
  async function showAdmin() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('admin-page').style.display = '';

    await loadSiteConfig();
    setupNav();
    setupEditorToolbar();
    setupArticleForm();
    setupImport();
    setupSettings();
    setupMobileMenu();
    loadArticles();
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  async function loadSiteConfig() {
    const res = await apiFetch(API_ARTICLES + '?action=config');
    if (res) {
      siteConfig = res;
      const el = document.getElementById('sidebar-site-name');
      if (el && res.siteName) el.textContent = res.siteName;
      // populate category datalist
      updateCategoryDatalist([]);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function setupNav() {
    const panelTitles = {
      'articles':    '文章管理',
      'add-article': '添加文章',
      'import':      '导入文章',
      'settings':    '网站设置',
    };

    document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
      item.addEventListener('click', () => {
        const panelId = item.dataset.panel;
        switchPanel(panelId);
        document.getElementById('topbar-title').textContent = panelTitles[panelId] || panelId;
        // Close mobile sidebar
        document.getElementById('admin-sidebar').classList.remove('open');
      });
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await apiFetch(API_AUTH + '?action=logout');
      location.reload();
    });

    document.getElementById('refresh-articles-btn').addEventListener('click', loadArticles);
  }

  function switchPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) panel.classList.add('active');
    const nav = document.querySelector(`.nav-item[data-panel="${panelId}"]`);
    if (nav) nav.classList.add('active');
  }

  // ── Mobile Menu ───────────────────────────────────────────────────────────
  function setupMobileMenu() {
    const btn     = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('admin-sidebar');
    btn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && !btn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  // ── Articles Table ─────────────────────────────────────────────────────────
  async function loadArticles() {
    const tbody = document.getElementById('articles-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">加载中…</td></tr>';

    const res = await apiFetch(API_ARTICLES + '?limit=200');
    if (!res || !res.articles) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:red;">加载失败</td></tr>';
      return;
    }

    allArticles = res.articles;
    filteredArticles = [...allArticles];

    document.getElementById('stat-total').textContent = allArticles.length;
    const cats = new Set(allArticles.map(a => a.category).filter(Boolean));
    document.getElementById('stat-cats').textContent = cats.size;

    updateCategoryDatalist([...cats]);
    renderArticlesTable(filteredArticles);
    setupTableSearch();
  }

  function renderArticlesTable(articles) {
    const tbody = document.getElementById('articles-tbody');
    if (!articles.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">暂无文章</td></tr>';
      return;
    }

    tbody.innerHTML = articles.map(a => {
      const hasAfs = !!(a.afs && a.afs.publisherId && a.afs.publisherId !== 'pub-XXXXXXXXXXXXXXXX');
      const tags   = (a.tags || []).slice(0, 3).map(t =>
        `<span class="badge badge-blue" style="font-size:.68rem;">${esc(t)}</span>`).join(' ');

      return `<tr>
        <td class="table-title">
          <a href="../article.html?id=${esc(a.id)}" target="_blank" style="color:var(--text);font-weight:500;">${esc(a.title)}</a>
          <small>${esc(a.slug || '')}</small>
        </td>
        <td>${a.category ? `<span class="badge badge-green">${esc(a.category)}</span>` : '<span style="color:var(--text-light)">—</span>'}</td>
        <td>${tags || '<span style="color:var(--text-light)">—</span>'}</td>
        <td style="white-space:nowrap;color:var(--text-muted);font-size:.8rem;">${formatDate(a.createdAt)}</td>
        <td>${hasAfs
          ? '<span class="badge badge-green">已配置</span>'
          : '<span class="badge" style="background:var(--bg-alt);color:var(--text-muted);">未配置</span>'}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick="adminActions.editArticle('${esc(a.id)}')">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="adminActions.deleteArticle('${esc(a.id)}', '${esc(a.title)}')">删除</button>
        </td>
      </tr>`;
    }).join('');
  }

  function setupTableSearch() {
    const input = document.getElementById('table-search-input');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      filteredArticles = q
        ? allArticles.filter(a =>
            a.title.toLowerCase().includes(q) ||
            (a.category || '').toLowerCase().includes(q) ||
            (a.excerpt || '').toLowerCase().includes(q))
        : [...allArticles];
      renderArticlesTable(filteredArticles);
    });
  }

  // ── Article Form ──────────────────────────────────────────────────────────
  function setupArticleForm() {
    const form = document.getElementById('article-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      await saveArticle();
    });

    document.getElementById('clear-form-btn').addEventListener('click', () => {
      resetForm();
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
      resetForm();
      editingId = null;
      switchPanel('articles');
    });
  }

  function resetForm() {
    document.getElementById('article-form').reset();
    document.getElementById('edit-article-id').value = '';
    document.getElementById('content-editor').innerHTML = '';
    document.getElementById('content-html').value = '';
    document.getElementById('article-form-title').textContent = '添加文章';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    document.getElementById('save-article-btn').textContent = '保存文章';
    editingId = null;
    showAlert('article-form-alert', '', '', false);
  }

  async function saveArticle() {
    // Sync editor content
    if (!htmlMode) {
      document.getElementById('content-html').value =
        document.getElementById('content-editor').innerHTML;
    }

    const title   = document.getElementById('f-title').value.trim();
    const content = document.getElementById('content-html').value.trim();

    if (!title) { showAlert('article-form-alert', 'danger', '请输入文章标题'); return; }
    if (!content) { showAlert('article-form-alert', 'danger', '请输入文章正文'); return; }

    const tagsRaw = document.getElementById('f-tags').value;
    const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const terms1  = [...document.querySelectorAll('.terms-1')].map(i => i.value.trim());
    const terms2  = [...document.querySelectorAll('.terms-2')].map(i => i.value.trim());

    const payload = {
      title,
      content,
      excerpt:   document.getElementById('f-excerpt').value.trim(),
      category:  document.getElementById('f-category').value.trim(),
      slug:      document.getElementById('f-slug').value.trim(),
      coverImage:document.getElementById('f-cover').value.trim(),
      tags,
      afs: {
        publisherId:        document.getElementById('f-afs-pub').value.trim(),
        styleId:            document.getElementById('f-afs-style').value.trim(),
        channelId:          document.getElementById('f-afs-channel').value.trim(),
        relatedTermsGroup1: terms1,
        relatedTermsGroup2: terms2,
      }
    };

    const btn = document.getElementById('save-article-btn');
    btn.disabled = true;
    btn.textContent = '保存中…';

    let res;
    if (editingId) {
      res = await apiFetch(`${API_ARTICLES}?id=${encodeURIComponent(editingId)}`, {
        method: 'PUT', body: payload
      });
    } else {
      res = await apiFetch(API_ARTICLES, { method: 'POST', body: payload });
    }

    btn.disabled = false;
    btn.textContent = '保存文章';

    if (res && res.success) {
      toast(editingId ? '文章已更新' : '文章已发布', 'success');
      resetForm();
      await loadArticles();
      switchPanel('articles');
    } else {
      showAlert('article-form-alert', 'danger', res?.error || '保存失败，请重试');
    }
  }

  // ── Edit Article ──────────────────────────────────────────────────────────
  async function editArticle(id) {
    showOverlay();
    const res = await apiFetch(`${API_ARTICLES}?id=${encodeURIComponent(id)}`);
    hideOverlay();
    if (!res || res.error) { toast('加载文章失败', 'error'); return; }

    const a = res;
    editingId = a.id;

    document.getElementById('edit-article-id').value = a.id;
    document.getElementById('f-title').value         = a.title || '';
    document.getElementById('f-category').value      = a.category || '';
    document.getElementById('f-tags').value          = (a.tags || []).join(', ');
    document.getElementById('f-cover').value         = a.coverImage || '';
    document.getElementById('f-slug').value          = a.slug || '';
    document.getElementById('f-excerpt').value       = a.excerpt || '';
    document.getElementById('content-editor').innerHTML = a.content || '';
    document.getElementById('content-html').value    = a.content || '';

    const afs = a.afs || {};
    document.getElementById('f-afs-pub').value     = afs.publisherId || '';
    document.getElementById('f-afs-style').value   = afs.styleId    || '';
    document.getElementById('f-afs-channel').value = afs.channelId  || '';

    const t1 = afs.relatedTermsGroup1 || [];
    const t2 = afs.relatedTermsGroup2 || [];
    document.querySelectorAll('.terms-1').forEach((inp, i) => { inp.value = t1[i] || ''; });
    document.querySelectorAll('.terms-2').forEach((inp, i) => { inp.value = t2[i] || ''; });

    document.getElementById('article-form-title').textContent = '编辑文章';
    document.getElementById('cancel-edit-btn').style.display  = '';
    document.getElementById('save-article-btn').textContent   = '更新文章';

    switchPanel('add-article');
    document.getElementById('topbar-title').textContent = '编辑文章';
    window.scrollTo(0, 0);
  }

  // ── Delete Article ────────────────────────────────────────────────────────
  function deleteArticle(id, title) {
    showConfirm(
      '删除文章',
      `确定要删除文章 "<strong>${esc(title)}</strong>" 吗？此操作无法撤销。`,
      async () => {
        showOverlay();
        const res = await apiFetch(`${API_ARTICLES}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        hideOverlay();
        if (res && res.success) {
          toast('文章已删除', 'success');
          await loadArticles();
        } else {
          toast(res?.error || '删除失败', 'error');
        }
      }
    );
  }

  // ── Editor Toolbar ────────────────────────────────────────────────────────
  function setupEditorToolbar() {
    const editor   = document.getElementById('content-editor');
    const htmlArea = document.getElementById('content-html');

    document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        editor.focus();

        if (cmd === 'html') {
          htmlMode = !htmlMode;
          if (htmlMode) {
            htmlArea.value = editor.innerHTML;
            editor.style.display = 'none';
            htmlArea.style.display = '';
            btn.textContent = '可视模式';
          } else {
            editor.innerHTML = htmlArea.value;
            editor.style.display = '';
            htmlArea.style.display = 'none';
            btn.textContent = 'HTML模式';
          }
          return;
        }

        if (htmlMode) return;

        if (cmd === 'h2') {
          document.execCommand('formatBlock', false, 'H2');
        } else if (cmd === 'h3') {
          document.execCommand('formatBlock', false, 'H3');
        } else if (cmd === 'blockquote') {
          document.execCommand('formatBlock', false, 'BLOCKQUOTE');
        } else if (cmd === 'createLink') {
          const url = prompt('输入链接 URL：', 'https://');
          if (url) document.execCommand('createLink', false, url);
        } else if (cmd === 'insertImage') {
          const url = prompt('输入图片 URL：', 'https://');
          if (url) document.execCommand('insertImage', false, url);
        } else {
          document.execCommand(cmd, false, null);
        }
      });
    });

    // Sync on tab-away
    editor.addEventListener('blur', () => {
      if (!htmlMode) htmlArea.value = editor.innerHTML;
    });
  }

  // ── Import ────────────────────────────────────────────────────────────────
  function setupImport() {
    const drop     = document.getElementById('import-drop');
    const fileInput= document.getElementById('import-file');

    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) processImportFile(file);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) processImportFile(fileInput.files[0]);
    });

    document.getElementById('import-json-btn').addEventListener('click', () => {
      const text = document.getElementById('import-json-text').value.trim();
      if (!text) { showAlert('import-alert', 'danger', '请粘贴 JSON 内容'); return; }
      processImportText(text);
    });

    document.getElementById('import-sample-btn').addEventListener('click', () => {
      const sample = {
        articles: [{
          title: '示例文章标题',
          slug: 'example-article',
          content: '<p>这是文章的正文内容，支持 <strong>HTML</strong> 格式。</p>',
          excerpt: '文章摘要简短描述',
          category: '示例分类',
          tags: ['标签1', '标签2'],
          coverImage: '',
          afs: {
            publisherId: 'pub-XXXXXXXXXXXXXXXX',
            styleId: 'XXXXXXXXXX',
            relatedTermsGroup1: ['搜索词1', '搜索词2', '搜索词3', '搜索词4', '搜索词5'],
            relatedTermsGroup2: ['搜索词1', '搜索词2', '搜索词3', '搜索词4', '搜索词5'],
          }
        }]
      };
      document.getElementById('import-json-text').value =
        JSON.stringify(sample, null, 2);
    });
  }

  function processImportFile(file) {
    const reader = new FileReader();
    reader.onload = e => processImportText(e.target.result);
    reader.readAsText(file, 'UTF-8');
  }

  async function processImportText(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      showAlert('import-alert', 'danger', 'JSON 格式错误：' + e.message);
      return;
    }
    if (!data.articles) { data = { articles: Array.isArray(data) ? data : [data] }; }

    showOverlay();
    const res = await apiFetch(`${API_ARTICLES}?action=import`, { method: 'POST', body: data });
    hideOverlay();

    if (res && res.success) {
      showAlert('import-alert', 'success',
        `导入完成：新增 ${res.imported} 篇，更新 ${res.updated} 篇`);
      toast('导入成功', 'success');
      await loadArticles();
    } else {
      showAlert('import-alert', 'danger', res?.error || '导入失败');
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function setupSettings() {
    // Load settings when panel is shown
    document.querySelector('.nav-item[data-panel="settings"]').addEventListener('click', loadSettingsForm);

    document.getElementById('settings-form').addEventListener('submit', async e => {
      e.preventDefault();
      await saveSettings();
    });
  }

  async function loadSettingsForm() {
    const res = await apiFetch(API_ARTICLES + '?action=config');
    if (!res) return;
    siteConfig = res;
    document.getElementById('s-name').value      = res.siteName || '';
    document.getElementById('s-url').value       = res.siteUrl || '';
    document.getElementById('s-desc').value      = res.siteDescription || '';
    document.getElementById('s-logo').value      = res.logo || '';
    document.getElementById('s-per-page').value  = res.articlesPerPage || 10;
    document.getElementById('s-afs-pub').value     = res.defaultAfsPublisherId  || '';
    document.getElementById('s-afs-style').value   = res.defaultAfsStyleId     || '';
    document.getElementById('s-afs-channel').value = res.defaultAfsChannelId   || '';
  }

  async function saveSettings() {
    const newPwd     = document.getElementById('s-new-pwd').value;
    const confirmPwd = document.getElementById('s-confirm-pwd').value;

    if (newPwd && newPwd !== confirmPwd) {
      showAlert('settings-alert', 'danger', '两次输入的密码不一致');
      return;
    }

    const payload = {
      siteName:               document.getElementById('s-name').value.trim(),
      siteUrl:                document.getElementById('s-url').value.trim(),
      siteDescription:        document.getElementById('s-desc').value.trim(),
      logo:                   document.getElementById('s-logo').value.trim(),
      articlesPerPage:        parseInt(document.getElementById('s-per-page').value, 10) || 10,
      defaultAfsPublisherId:  document.getElementById('s-afs-pub').value.trim(),
      defaultAfsStyleId:      document.getElementById('s-afs-style').value.trim(),
      defaultAfsChannelId:    document.getElementById('s-afs-channel').value.trim(),
    };
    if (newPwd) payload.newPassword = newPwd;

    showOverlay();
    const res = await apiFetch(`${API_ARTICLES}?action=config`, { method: 'PUT', body: payload });
    hideOverlay();

    if (res && res.success) {
      showAlert('settings-alert', 'success', '设置已保存');
      toast('设置已保存', 'success');
      siteConfig = res.config || payload;
      document.getElementById('sidebar-site-name').textContent = siteConfig.siteName || '我的博客';
      document.getElementById('s-new-pwd').value     = '';
      document.getElementById('s-confirm-pwd').value = '';
    } else {
      showAlert('settings-alert', 'danger', res?.error || '保存失败');
    }
  }

  // ── Confirm Modal ─────────────────────────────────────────────────────────
  function showConfirm(title, body, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').innerHTML    = body;
    document.getElementById('confirm-modal').classList.add('show');
    confirmCallback = onConfirm;
  }

  document.getElementById('confirm-ok').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('show');
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
  });
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('show');
    confirmCallback = null;
  });
  document.getElementById('confirm-close').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('show');
    confirmCallback = null;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showOverlay()  { document.getElementById('loading-overlay').classList.add('show'); }
  function hideOverlay()  { document.getElementById('loading-overlay').classList.remove('show'); }

  function showAlert(containerId, type, message, show = true) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!show) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.className = `alert alert-${type}`;
    el.innerHTML = message;
    el.style.display = '';
    if (type === 'success') {
      setTimeout(() => { el.style.display = 'none'; }, 4000);
    }
  }

  function toast(message, type = 'info') {
    const toaster = document.getElementById('toaster');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    toaster.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = '.3s'; }, 2800);
    setTimeout(() => t.remove(), 3100);
  }

  function updateCategoryDatalist(cats) {
    const dl = document.getElementById('category-datalist');
    if (!dl) return;
    dl.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
  }

  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('zh-CN'); } catch { return iso; }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── API Fetch ─────────────────────────────────────────────────────────────
  async function apiFetch(url, options = {}) {
    const opts = {
      method:      options.method || 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    };
    if (options.body) opts.body = JSON.stringify(options.body);
    try {
      const res  = await fetch(url, opts);
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('API error:', e);
      return null;
    }
  }

  // ── Expose to inline onclick handlers ─────────────────────────────────────
  window.adminActions = { editArticle, deleteArticle };

  init();
})();
