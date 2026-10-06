/* The shared page chrome. Since the remodel (6 Oct 2026) the frame is the
   shared MSP sidebar from assets/msp-ui: msp-shell.js builds it, msp-ui.css
   styles it, and this file hands the shell the tool's title, navigation and
   version line. The old Collent-style header bar and slide-in menu pane are
   gone (the sidebar is the menu now); the "Need help?" pane stays, opened
   from the sidebar or from any element with data-pane="help", and composes an
   email to the committee. Keyboard: Alt+F1 jumps to the navigation (opens the
   drawer on a phone), Esc closes the help pane.
   Call MSPChrome.render() once per page after config.js and msp-shell.js. */
(function () {
  const VERSION = "0.1";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* The sidebar navigation: the entries of the old menu pane, flattened.
     One "Projects" item; the level filter lives inside the catalogue page
     (chips above the list plus the Level column filter). */
  function navItems() {
    return [
      { label: "Dashboard",              hint: "Dates and state",   href: "index.html",              icon: "grid" },
      { label: "Projects",               hint: "The catalogue",     href: "projects.html",           icon: "list" },
      { label: "Offer a project",        hint: "Staff form",        href: "submit.html",             icon: "edit" },
      { label: "Description guidelines", hint: "Before you write",  href: "submit.html#guidelines",  icon: "filetext" },
      { divider: true },
      { label: "Committee",              hint: "Log in",            href: "admin.html",              icon: "lock" },
      { label: "Need help?",             hint: "Contacts",          href: "#help",                   icon: "help", help: true },
    ];
  }

  function helpHTML(contact) {
    return `
      <p class="c-hint">Please specify your question below. Choosing the right type speeds things up: technical problems go to the tool's maintainer, project questions to the committee.</p>
      <div class="c-form" style="padding:0;max-width:none">
        <div class="c-field"><label for="help-type">Question type</label>
          <select id="help-type">
            <option>Project period related question</option>
            <option>Report a technical problem or malfunction</option>
          </select></div>
        <div class="c-field"><label for="help-msg">Message</label><textarea id="help-msg" style="min-height:140px"></textarea></div>
        <div class="c-field"><label for="help-email">Contact email</label><input id="help-email" type="email" placeholder="name@maastrichtuniversity.nl"></div>
        <div id="help-note" class="c-hint"></div>
        <div class="c-actions"><button class="c-btn primary" id="help-send"><i class="fa-solid fa-paper-plane"></i> Send</button></div>
        <p class="c-hint" style="margin-top:14px">Send opens your mail program with the message addressed to <a href="mailto:${esc(contact)}">${esc(contact)}</a>.</p>
        <p class="c-hint" style="margin-top:14px"><span class="c-kbd">Alt</span> + <span class="c-kbd">F1</span> jumps to the menu, <span class="c-kbd">Esc</span> closes this pane.</p>
      </div>`;
  }

  function render() {
    const cfg = window.MSP_CONFIG || {};
    const contact = cfg.CONTACT_EMAIL || "msp-projects@maastrichtuniversity.nl";

    // the old header and footer placeholders, if a page still carries them
    ["chrome-header", "chrome-footer"].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });

    // the help pane and its overlay
    const overlay = document.createElement("div");
    overlay.className = "c-overlay";
    const help = document.createElement("aside");
    help.className = "c-pane"; help.id = "c-pane-help"; help.setAttribute("aria-label", "Need help?");
    help.innerHTML = `<div class="c-pane-head"><span><i class="fa-solid fa-circle-question"></i> Need help?</span><button aria-label="Close" data-close>&times;</button></div>
      <div class="c-pane-body">${helpHTML(contact)}</div>`;
    document.body.append(overlay, help);

    function openHelp() {
      help.classList.add("open");
      overlay.classList.add("open");
      document.body.classList.add("noscroll");
      help.scrollTop = 0;
      const first = help.querySelector("#help-type");
      if (first) first.focus();
    }
    function closeHelp() {
      help.classList.remove("open");
      overlay.classList.remove("open");
      document.body.classList.remove("noscroll");
    }
    function toggleHelp() { help.classList.contains("open") ? closeHelp() : openHelp(); }
    function focusNav() {
      if (window.MSPShell && window.innerWidth <= 900) { MSPShell.toggle(); return; }
      const first = document.querySelector(".msp-sb-link");
      if (first) first.focus();
    }

    // the shared frame
    if (window.MSPShell) {
      MSPShell.init({
        title: "MSP Project Periods",
        home: "index.html",
        nav: navItems(),
        meta: `<span>Project Periods ${VERSION}</span><span>FSE-MSP Project Committee</span><span>&copy; 2026 Maastricht University</span>`,
        onNavigate: (item) => { if (item && item.help) { toggleHelp(); return false; } },
      });
    }

    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-pane]");
      if (t) { e.preventDefault(); toggleHelp(); return; }
      if (e.target.closest("[data-close]") || e.target === overlay) closeHelp();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeHelp();
      else if (e.altKey && e.key === "F1") { e.preventDefault(); focusNav(); }
    });

    help.querySelector("#help-send").addEventListener("click", () => {
      const type = help.querySelector("#help-type").value;
      const msg = help.querySelector("#help-msg").value.trim();
      const email = help.querySelector("#help-email").value.trim();
      const note = help.querySelector("#help-note");
      if (!msg) { note.textContent = "Please write a message first."; return; }
      const subject = encodeURIComponent(`[Project Periods] ${type}`);
      const body = encodeURIComponent(`${msg}\n\nContact: ${email || "(not given)"}\nPage: ${location.href}`);
      note.textContent = "";
      window.location.href = `mailto:${contact}?subject=${subject}&body=${body}`;
    });

    return { openHelp, closeHelp, toggleHelp };
  }

  window.MSPChrome = { render, navItems, helpHTML, VERSION };
})();
