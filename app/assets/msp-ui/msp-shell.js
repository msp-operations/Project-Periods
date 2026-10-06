/* ============================================================================
   MSP Shell  -  injects the shared sidebar frame into any MSP site
   ----------------------------------------------------------------------------
   Pair with msp-ui.css in the same folder. Usage, at the end of <body> (or in
   <head> with defer):

     <link rel="stylesheet" href="assets/msp-ui/msp-ui.css">
     <script src="assets/msp-ui/msp-shell.js"></script>
     <script>
       MSPShell.init({
         title: 'MSP Tutor Registration',
         nav: [
           { label: 'Home',              hint: 'Open positions',   href: 'index.html',    icon: 'home' },
           { label: 'Register to tutor', hint: 'Apply for a course', href: 'register.html', icon: 'edit' },
           { divider: true },
           { label: 'Office login',      hint: 'Dashboard',        href: 'admin.html',    icon: 'lock' }
         ],
         footer: 'Your data stays in your browser.'
       });
     </script>

   What it does
     - builds <aside class="msp-sidebar"> (UM wordmark, title, subtitle, nav,
       optional meta slot, MSP emblem footer, "All MSP tools" link to the hub)
     - wraps the existing body content in .msp-app > .msp-content, so the
       page needs no markup changes beyond removing its old header
     - adds the mobile toggle + overlay and the keyboard/aria wiring
     - marks the active link (by file name, by hash, or by cfg.active)

   Config keys (all optional except title and nav)
     title       string   site name shown in the brand block
     subtitle    html     default "Maastricht Science Programme<br>Faculty of Science &amp; Engineering"
     home        url      where the brand block links (default: first nav item or index.html)
     nav         array    { label, hint, href, icon, external, active, match, group }
                          { divider:true }  or  { label:'Group', group:true }  for a section label
     active      string   href of the item to mark active (overrides auto-detection)
     meta        html     content for the slot between nav and footer (status lines, buttons)
     footer      string   privacy / one-liner under the MSP emblem
     hub         url|false  link to the MSP tools hub (default HUB_URL below; false hides it)
     base        url      folder holding the logos (default: this script's folder)
     wrap        bool     wrap body content in .msp-content (default true)
     bodyClass   bool     add .msp-body to <body> for the base type/background (default true)
     onNavigate  fn(item, event)  called on nav clicks; return false to stop default

   Methods
     MSPShell.setActive(href)   MSPShell.setMeta(html)   MSPShell.open() / close() / toggle()
     MSPShell.icon(name)        returns the SVG string for an icon name
   ========================================================================== */
(function (global) {
  'use strict';

  var HUB_URL = 'https://msp-operations.github.io/MSP-Hub/';   // not live yet, see _REMODEL_CONTEXT.md
  var SUBTITLE = 'Maastricht Science Programme<br>Faculty of Science &amp; Engineering';

  var scriptEl = document.currentScript;
  var BASE = scriptEl ? scriptEl.src.replace(/[^\/]*$/, '') : '';

  /* Feather-style icons, 24x24 stroke, same set as the planner uses */
  var P = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    grid:     P + '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    calendar: P + '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    book:     P + '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    info:     P + '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    home:     P + '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    users:    P + '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    user:     P + '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    map:      P + '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    globe:    P + '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    star:     P + '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    help:     P + '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    mail:     P + '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    file:     P + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    search:   P + '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    clock:    P + '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    flag:     P + '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    check:    P + '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    settings: P + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    upload:   P + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    download: P + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    external: P + '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    award:    P + '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
    briefcase:P + '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    list:     P + '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    lock:     P + '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    unlock:   P + '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
    login:    P + '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    logout:   P + '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    layers:   P + '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    edit:     P + '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    send:     P + '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    video:    P + '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    filetext: P + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    clipboard:P + '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    compass:  P + '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    target:   P + '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    bar:      P + '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    pie:      P + '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
    heart:    P + '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    gradcap:  P + '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
    shield:   P + '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    bell:     P + '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    tool:     P + '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    link:     P + '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    back:     P + '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    menu:     P + '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    x:        P + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    hub:      P + '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="3" r="1.5"/><circle cx="12" cy="21" r="1.5"/><circle cx="3" cy="12" r="1.5"/><circle cx="21" cy="12" r="1.5"/><line x1="12" y1="9" x2="12" y2="4.5"/><line x1="12" y1="15" x2="12" y2="19.5"/><line x1="9" y1="12" x2="4.5" y2="12"/><line x1="15" y1="12" x2="19.5" y2="12"/></svg>'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function icon(name) { return ICONS[name] || ICONS.file; }

  function fileOf(url) {
    try {
      var a = document.createElement('a'); a.href = url;
      var p = a.pathname.replace(/\/+$/, '');
      var f = p.substring(p.lastIndexOf('/') + 1);
      return (f === '' ? 'index.html' : f).toLowerCase();
    } catch (e) { return ''; }
  }
  function hashOf(url) { var i = url.indexOf('#'); return i >= 0 ? url.substring(i) : ''; }

  var state = { cfg: null, aside: null, overlay: null, toggle: null, links: [] };

  function buildNav(items, cfg) {
    var html = '';
    items.forEach(function (it, idx) {
      if (it.divider) { html += '<div class="msp-sb-divider"></div>'; return; }
      if (it.group) { html += '<div class="msp-sb-label">' + esc(it.label) + '</div>'; return; }
      var href = it.href || '';
      var ext = it.external === true || (it.external !== false && /^https?:\/\//i.test(href) && href.indexOf(location.origin) !== 0);
      html += '<a class="msp-sb-link" data-idx="' + idx + '" href="' + esc(it.href || '#') + '"' +
        (ext ? ' target="_blank" rel="noopener"' : '') +
        (it.title ? ' title="' + esc(it.title) + '"' : '') + '>' +
        '<span class="msp-sb-ico">' + icon(it.icon) + '</span>' +
        '<span class="msp-sb-text">' + esc(it.label) +
        (it.hint ? '<span class="msp-sb-hint">' + esc(it.hint) + '</span>' : '') + '</span>' +
        (ext ? '<span class="msp-sb-ext">' + ICONS.external + '</span>' : '') +
        '</a>';
    });
    return html;
  }

  function build(cfg) {
    var base = cfg.base != null ? cfg.base : BASE;
    var firstNav = (cfg.nav || []).filter(function (i) { return i.href; })[0];
    var home = cfg.home || (firstNav ? firstNav.href : 'index.html');
    var hub = cfg.hub === undefined ? HUB_URL : cfg.hub;
    var hasLabel = (cfg.nav || []).some(function (i) { return i.group; });

    var aside = document.createElement('aside');
    aside.className = 'msp-sidebar';
    aside.id = 'msp-sidebar';
    aside.setAttribute('aria-label', 'Site navigation');
    aside.innerHTML =
      '<div class="msp-sb-brand"><a href="' + esc(home) + '">' +
        '<img src="' + esc(base + 'um-wordmark.png') + '" alt="Maastricht University" class="msp-sb-logo">' +
        '<div class="msp-sb-title">' + esc(cfg.title) + '</div>' +
        '<div class="msp-sb-sub">' + (cfg.subtitle != null ? cfg.subtitle : SUBTITLE) + '</div>' +
      '</a></div>' +
      '<nav class="msp-sb-nav" aria-label="Main">' +
        (hasLabel ? '' : '<div class="msp-sb-label">Navigation</div>') +
        buildNav(cfg.nav || [], cfg) +
      '</nav>' +
      '<div class="msp-sb-meta" id="msp-sb-meta">' + (cfg.meta || '') + '</div>' +
      '<div class="msp-sb-footer">' +
        '<img src="' + esc(base + 'msp-emblem.png') + '" alt="Maastricht Science Programme">' +
        (cfg.footer ? '<div class="msp-sb-privacy">' + esc(cfg.footer) + '</div>' : '') +
        (hub ? '<a class="msp-sb-hub" href="' + esc(hub) + '">' + ICONS.hub + ' All MSP tools</a>' : '') +
      '</div>';
    return aside;
  }

  function wrap(aside) {
    var body = document.body;
    var app = document.createElement('div'); app.className = 'msp-app';
    var content = document.createElement('div'); content.className = 'msp-content'; content.id = 'msp-content';
    // move everything that is in the body now into the content column
    var nodes = Array.prototype.slice.call(body.childNodes);
    nodes.forEach(function (n) { content.appendChild(n); });
    app.appendChild(aside);
    app.appendChild(content);
    body.insertBefore(app, body.firstChild);
    return content;
  }

  function addChrome(aside) {
    var toggle = document.createElement('button');
    toggle.className = 'msp-sb-toggle'; toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.setAttribute('aria-controls', 'msp-sidebar');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = ICONS.menu;
    var overlay = document.createElement('div'); overlay.className = 'msp-sb-overlay';
    var skip = document.createElement('a'); skip.className = 'msp-skip'; skip.href = '#msp-content'; skip.textContent = 'Skip to content';
    document.body.insertBefore(skip, document.body.firstChild);
    document.body.appendChild(toggle);
    document.body.appendChild(overlay);
    toggle.addEventListener('click', toggleDrawer);
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    state.toggle = toggle; state.overlay = overlay;
  }

  function open() {
    if (!state.aside) return;
    state.aside.classList.add('open'); state.overlay.classList.add('show');
    document.body.classList.add('msp-sb-locked');
    state.toggle.setAttribute('aria-expanded', 'true'); state.toggle.innerHTML = ICONS.x;
  }
  function close() {
    if (!state.aside) return;
    state.aside.classList.remove('open'); state.overlay.classList.remove('show');
    document.body.classList.remove('msp-sb-locked');
    state.toggle.setAttribute('aria-expanded', 'false'); state.toggle.innerHTML = ICONS.menu;
  }
  function toggleDrawer() { state.aside.classList.contains('open') ? close() : open(); }

  function setActive(href) {
    var items = state.cfg.nav || [];
    var curFile = fileOf(location.href), curHash = location.hash;
    var chosen = -1;
    if (href != null) {
      items.forEach(function (it, i) { if (it.href === href) chosen = i; });
    } else {
      // explicit flags first, then regex match, then hash match, then file match
      items.forEach(function (it, i) { if (it.active === true) chosen = i; });
      if (chosen < 0) items.forEach(function (it, i) {
        if (chosen < 0 && it.match && new RegExp(it.match).test(location.href)) chosen = i;
      });
      if (chosen < 0 && curHash) items.forEach(function (it, i) {
        if (chosen < 0 && it.href && hashOf(it.href) && hashOf(it.href) === curHash && (fileOf(it.href) === curFile || !fileOf(it.href))) chosen = i;
      });
      if (chosen < 0) items.forEach(function (it, i) {
        if (chosen < 0 && it.href && !hashOf(it.href) && !/^https?:/i.test(it.href) && fileOf(it.href) === curFile) chosen = i;
      });
    }
    state.links.forEach(function (a) {
      var on = parseInt(a.getAttribute('data-idx'), 10) === chosen;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function setMeta(html) { var m = document.getElementById('msp-sb-meta'); if (m) m.innerHTML = html || ''; }

  function init(cfg) {
    if (state.aside) return state;  // already built
    state.cfg = cfg = cfg || {};
    if (cfg.bodyClass !== false) document.body.classList.add('msp-body');
    var aside = build(cfg);
    state.aside = aside;
    if (cfg.wrap !== false) wrap(aside); else document.body.insertBefore(aside, document.body.firstChild);
    addChrome(aside);
    state.links = Array.prototype.slice.call(aside.querySelectorAll('.msp-sb-link'));
    state.links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var it = cfg.nav[parseInt(a.getAttribute('data-idx'), 10)];
        if (cfg.onNavigate && cfg.onNavigate(it, e) === false) { e.preventDefault(); }
        if (window.innerWidth <= 900) close();
      });
    });
    setActive(cfg.active != null ? cfg.active : undefined);
    window.addEventListener('hashchange', function () { if (cfg.active == null) setActive(); });
    return state;
  }

  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  global.MSPShell = {
    init: function (cfg) { ready(function () { init(cfg); }); return global.MSPShell; },
    setActive: setActive, setMeta: setMeta, open: open, close: close, toggle: toggleDrawer,
    icon: icon, icons: ICONS, HUB_URL: HUB_URL, base: BASE
  };
})(window);
