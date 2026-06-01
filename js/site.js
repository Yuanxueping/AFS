/* ── Shared site utilities (header/footer name + domain derivation) ───────── */
(function (w) {
  'use strict';

  /* Derive site name from domain: "example.com" → "Example" */
  function nameFromDomain() {
    var h = w.location.hostname.replace(/^www\./, '');
    var parts = h.split('.');
    var base = parts.length >= 2 ? parts.slice(0, -1).join('') : h;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  /* Apply site name + footer copyright to all matching elements */
  function applySiteName(name) {
    document.querySelectorAll('.logo-text, #footer-site-name').forEach(function(el) {
      el.textContent = name;
    });
    var ft = document.getElementById('footer-text');
    if (ft) ft.textContent = '© ' + new Date().getFullYear() + ' ' + name + '. All rights reserved.';
    var dt = document.getElementById('page-doc-title');
    if (dt) document.title = document.title.replace(/^.*—\s*/, '') + ' — ' + name;
  }

  /* Load config from API, fallback to domain name */
  function initSiteName() {
    fetch('/api/articles.php?action=config')
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(cfg){
        applySiteName((cfg && cfg.siteName) || nameFromDomain());
        /* expose for callers */
        w._siteConfig = cfg || {};
        if (w._siteConfigReady) w._siteConfigReady(cfg || {});
      })
      .catch(function(){ applySiteName(nameFromDomain()); });
  }

  w._getSiteName = function() {
    return (w._siteConfig && w._siteConfig.siteName) || nameFromDomain();
  };

  w._nameFromDomain = nameFromDomain;

  document.addEventListener('DOMContentLoaded', initSiteName);
})(window);
