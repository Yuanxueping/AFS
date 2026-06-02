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
    setupEmbedModal();
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
      const hasAfs = !!(a.afs && a.afs.styleId);
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
        <td style="width:1%;white-space:nowrap;text-align:right;vertical-align:middle;padding:.75rem .9rem;">
          <button class="btn btn-outline btn-sm" onclick="adminActions.editArticle('${esc(a.id)}')">编辑</button>
          <button class="btn btn-danger btn-sm" style="margin-left:.3rem;" onclick="adminActions.deleteArticle('${esc(a.id)}', '${esc(a.title)}')">删除</button>
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
      document.getElementById('content-html').value = getEditorContent();
    }

    const title   = document.getElementById('f-title').value.trim();
    const content = document.getElementById('content-html').value.trim();

    if (!title) { showAlert('article-form-alert', 'danger', '请输入文章标题'); return; }
    if (!content) { showAlert('article-form-alert', 'danger', '请输入文章正文'); return; }

    const tagsRaw = document.getElementById('f-tags').value;
    const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const payload = {
      title,
      content,
      excerpt:   document.getElementById('f-excerpt').value.trim(),
      category:  document.getElementById('f-category').value.trim(),
      slug:      document.getElementById('f-slug').value.trim(),
      coverImage:document.getElementById('f-cover').value.trim(),
      tags,
      afs: {
        styleId:         document.getElementById('f-afs-style').value.trim(),
        channelId:       document.getElementById('f-afs-channel').value.trim(),
        facebookPixelId: document.getElementById('f-fb-pixel').value.trim(),
        tiktokPixelId:   document.getElementById('f-tt-pixel').value.trim(),
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
    document.getElementById('f-afs-style').value   = afs.styleId         || '';
    document.getElementById('f-afs-channel').value = afs.channelId       || '';
    document.getElementById('f-fb-pixel').value    = afs.facebookPixelId || '';
    document.getElementById('f-tt-pixel').value    = afs.tiktokPixelId   || '';

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
    const htmlBtn  = document.getElementById('html-mode-btn');

    document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
      // Prevent mousedown from stealing focus — keeps editor selection intact
      btn.addEventListener('mousedown', e => e.preventDefault());

      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;

        if (cmd === 'html') {
          htmlMode = !htmlMode;
          if (htmlMode) {
            htmlArea.value = getEditorContent();
            editor.style.display = 'none';
            htmlArea.style.display = '';
            htmlBtn.textContent = '可视模式';
          } else {
            editor.innerHTML = htmlArea.value;
            editor.style.display = '';
            htmlArea.style.display = 'none';
            htmlBtn.textContent = 'HTML模式';
          }
          return;
        }

        if (cmd === 'embedHtml') {
          // Editor still has focus (mousedown prevented steal), save selection now
          saveSelection();
          openEmbedModal();
          return;
        }

        if (htmlMode) return;
        editor.focus();

        if (cmd === 'h2') {
          document.execCommand('formatBlock', false, 'H2');
        } else if (cmd === 'h3') {
          document.execCommand('formatBlock', false, 'H3');
        } else if (cmd === 'blockquote') {
          document.execCommand('formatBlock', false, 'BLOCKQUOTE');
        } else if (cmd === 'inlineCode') {
          const sel = window.getSelection();
          const text = sel && sel.toString() ? sel.toString() : '';
          document.execCommand('insertHTML', false, `<code>${text || '代码'}</code>`);
        } else if (cmd === 'codeBlock') {
          document.execCommand('insertHTML', false, '<pre><code>代码块</code></pre><p><br></p>');
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

    // Tab key in HTML textarea
    htmlArea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = htmlArea.selectionStart, end = htmlArea.selectionEnd;
        htmlArea.value = htmlArea.value.substring(0, s) + '  ' + htmlArea.value.substring(end);
        htmlArea.selectionStart = htmlArea.selectionEnd = s + 2;
      }
    });

    // Sync content when editor loses focus
    editor.addEventListener('blur', () => {
      if (!htmlMode) htmlArea.value = getEditorContent();
    });

    // Normalize paste: strip outer divs/spans, keep semantic tags, wrap bare text in <p>
    editor.addEventListener('paste', e => {
      e.preventDefault();
      let html = e.clipboardData.getData('text/html');
      let cleaned;
      if (html) {
        cleaned = cleanPastedHtml(html);
      } else {
        const text = e.clipboardData.getData('text/plain');
        cleaned = text.split(/\n{2,}/).map(para =>
          `<p>${para.replace(/\n/g, '<br>').trim()}</p>`
        ).filter(p => p !== '<p></p>').join('') || `<p>${text}</p>`;
      }

      // Insert via Range API — avoids execCommand re-wrapping in divs
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const tmp = document.createElement('div');
        tmp.innerHTML = cleaned;
        const frag = document.createDocumentFragment();
        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
        const lastNode = frag.lastChild;
        range.insertNode(frag);
        // Move cursor to end of inserted content
        if (lastNode) {
          range.setStartAfter(lastNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // Final normalization pass: ensure editor has no stray divs/spans
      normalizeEditor(editor);
    });

    // Enter key: always insert <p> not <div>
    editor.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertParagraph', false, null);
        // execCommand('insertParagraph') may still produce <div> in some browsers
        normalizeEditor(editor);
      }
    });
  }

  // After-paste normalization: walk editor children and fix remaining divs/spans
  function normalizeEditor(editor) {
    const BLOCK = new Set(['P','H1','H2','H3','H4','H5','H6','UL','OL',
                           'BLOCKQUOTE','PRE','TABLE','FIGURE','HR']);

    // Unwrap all spans
    editor.querySelectorAll('span').forEach(span => {
      span.replaceWith(...span.childNodes);
    });

    // Convert/unwrap divs (deepest first)
    [...editor.querySelectorAll('div')].reverse().forEach(div => {
      if (div === editor) return;
      const hasBlock = [...div.children].some(c => BLOCK.has(c.tagName));
      if (hasBlock) {
        div.replaceWith(...div.childNodes);
      } else {
        const p = document.createElement('p');
        p.innerHTML = div.innerHTML;
        div.replaceWith(p);
      }
    });

    // Wrap orphaned top-level text nodes in <p>
    [...editor.childNodes].forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        const p = document.createElement('p');
        node.replaceWith(p);
        p.appendChild(node);
      }
    });

    // Strip all inline styles
    editor.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));

    // Remove empty paragraphs
    editor.querySelectorAll('p').forEach(p => {
      if (!p.textContent.trim() && !p.querySelector('img,br')) p.remove();
    });
  }

  // Clean pasted HTML: keep only semantic structure, strip all inline styles
  function cleanPastedHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    // Remove junk elements entirely
    tmp.querySelectorAll('meta,style,script,link,xml,head,[class*="Apple-"],o\\:p')
       .forEach(el => el.remove());

    // Strip ALL inline styles and class/id attributes from every element
    tmp.querySelectorAll('[style],[class],[id]').forEach(el => {
      el.removeAttribute('style');
      el.removeAttribute('class');
      // keep id only on headings (for TOC anchors)
      if (!el.tagName.match(/^H[1-6]$/)) el.removeAttribute('id');
    });

    const BLOCK = new Set(['H1','H2','H3','H4','H5','H6','UL','OL','LI',
                           'BLOCKQUOTE','PRE','TABLE','TR','TD','TH','FIGURE','HR']);

    // Unwrap ALL spans — they carry no semantic meaning after styles are stripped
    tmp.querySelectorAll('span').forEach(span => {
      span.replaceWith(...span.childNodes);
    });

    // Handle divs: unwrap if they contain block elements, else convert to <p>
    // Process from deepest to shallowest to avoid double-processing
    [...tmp.querySelectorAll('div')].reverse().forEach(div => {
      const hasBlock = [...div.children].some(c => BLOCK.has(c.tagName));
      if (hasBlock) {
        div.replaceWith(...div.childNodes);
      } else {
        const p = document.createElement('p');
        p.innerHTML = div.innerHTML;
        div.replaceWith(p);
      }
    });

    // Strip inline styles that crept in via allowed elements (p, h2, li…)
    tmp.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));

    // Remove empty paragraphs
    tmp.querySelectorAll('p').forEach(p => {
      if (!p.textContent.trim() && !p.querySelector('img,br')) p.remove();
    });

    return tmp.innerHTML;
  }

  // Extract final HTML — replace embed placeholders with their raw HTML
  function getEditorContent() {
    const editor = document.getElementById('content-editor');
    const clone  = editor.cloneNode(true);
    clone.querySelectorAll('.html-embed-block').forEach(el => {
      const raw = el.getAttribute('data-html') || '';
      const placeholder = document.createElement('div');
      placeholder.innerHTML = raw;
      el.replaceWith(...placeholder.childNodes);
    });
    return clone.innerHTML;
  }

  // ── Embed HTML Modal ──────────────────────────────────────────────────────
  let savedRange = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const editor = document.getElementById('content-editor');
    editor.focus();
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function openEmbedModal() {
    const modal = document.getElementById('embed-modal');
    const input = document.getElementById('embed-html-input');
    input.value = '';
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
  }

  function closeEmbedModal() {
    document.getElementById('embed-modal').style.display = 'none';
  }

  function insertEmbedHtml() {
    const input = document.getElementById('embed-html-input');
    const raw   = input.value.trim();
    if (!raw) { closeEmbedModal(); return; }

    closeEmbedModal();

    if (htmlMode) {
      const htmlArea = document.getElementById('content-html');
      const s = htmlArea.selectionStart;
      htmlArea.value = htmlArea.value.substring(0, s) + '\n' + raw + '\n' + htmlArea.value.substring(htmlArea.selectionEnd);
      htmlArea.selectionStart = htmlArea.selectionEnd = s + raw.length + 2;
      htmlArea.focus();
    } else {
      restoreSelection();
      // Show a labeled, non-editable placeholder block in visual mode
      const label = raw.startsWith('<iframe') ? 'iframe 嵌入' :
                    raw.startsWith('<script') ? 'Script 嵌入' : 'HTML 代码块';
      const escaped = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const block = `<div class="html-embed-block" contenteditable="false" data-html="${escaped}"><span class="embed-label">📎 ${label}</span><pre class="embed-preview">${escaped.substring(0, 120)}${escaped.length > 120 ? '…' : ''}</pre></div><p><br></p>`;
      document.execCommand('insertHTML', false, block);
    }
  }

  function setupEmbedModal() {
    document.getElementById('embed-modal-close').addEventListener('click', closeEmbedModal);
    document.getElementById('embed-modal-cancel').addEventListener('click', closeEmbedModal);
    document.getElementById('embed-modal-insert').addEventListener('click', insertEmbedHtml);
    document.getElementById('embed-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeEmbedModal();
    });
    document.getElementById('embed-html-input').addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = e.target.selectionStart, end = e.target.selectionEnd;
        e.target.value = e.target.value.substring(0, s) + '  ' + e.target.value.substring(end);
        e.target.selectionStart = e.target.selectionEnd = s + 2;
      }
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
            styleId: '1234566',
            channelId: '1111111',
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
    document.getElementById('s-afs-pub').value     = res.afsPublisherId     || '';
    document.getElementById('s-afs-style').value   = res.defaultAfsStyleId  || '';
    document.getElementById('s-afs-channel').value = res.defaultAfsChannelId || '';
    document.getElementById('s-fb-pixel').value    = res.facebookPixelId    || '';
    document.getElementById('s-tt-pixel').value    = res.tiktokPixelId      || '';
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
      afsPublisherId:      document.getElementById('s-afs-pub').value.trim(),
      defaultAfsStyleId:   document.getElementById('s-afs-style').value.trim(),
      defaultAfsChannelId: document.getElementById('s-afs-channel').value.trim(),
      facebookPixelId:     document.getElementById('s-fb-pixel').value.trim(),
      tiktokPixelId:       document.getElementById('s-tt-pixel').value.trim(),
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
