/* The shared page chrome: header bar, footer, and the two slide-in panes that
   Collent has behind its header links. "Dashboard" opens the menu pane from any
   page, "Need help?" opens a short help form that composes an email to the
   committee. Keyboard: Alt+F1 toggles the menu, Esc closes whatever is open.
   Call MSPChrome.render() once per page after config.js is loaded.
   Marks: the UM flag (cropped from the faculty logo) and the MSP emblem, white
   on the blue bar, grey in the footer. */
(function () {
  const MARK = (variant) => `<img class="c-mark" src="assets/img/msp-logo-${variant}.png" alt="Maastricht Science Programme">`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function menuHTML() {
    return `
      <div class="c-sections">
        <section class="c-sec"><h2><i class="fa-solid fa-book-open"></i> Projects</h2><ul>
          <li><a href="projects.html">Projects</a></li>
          <li><a href="projects.html?level=1000">1000-level</a></li>
          <li><a href="projects.html?level=2000">2000-level</a></li>
          <li><a href="projects.html?level=3000">3000-level</a></li></ul></section>
        <section class="c-sec"><h2><i class="fa-solid fa-pen-to-square"></i> Forms</h2><ul>
          <li><a href="submit.html">Offer a project</a></li>
          <li><a href="submit.html#guidelines">Description guidelines</a></li></ul></section>
        <section class="c-sec"><h2><i class="fa-solid fa-calendar-days"></i> Period</h2><ul>
          <li><a href="index.html">Dates and state</a></li></ul></section>
        <section class="c-sec"><h2><i class="fa-solid fa-user-shield"></i> Committee</h2><ul>
          <li><a href="admin.html">Dashboard</a></li>
          <li><a href="admin.html">Log in</a></li></ul></section>
        <section class="c-sec"><h2><i class="fa-solid fa-circle-info"></i> Information</h2><ul>
          <li><a href="index.html">About the project period</a></li></ul></section>
        <section class="c-sec"><h2><i class="fa-solid fa-circle-question"></i> Support</h2><ul>
          <li><a href="#" data-pane="help">Contacts</a></li>
          <li><a href="#" data-pane="help">Need help?</a></li></ul></section>
      </div>`;
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
      </div>`;
  }

  function render() {
    const cfg = window.MSP_CONFIG || {};
    const contact = cfg.CONTACT_EMAIL || "msp-projects@maastrichtuniversity.nl";
    const header = document.getElementById("chrome-header");
    const footer = document.getElementById("chrome-footer");
    if (header) header.innerHTML = `
      <a href="index.html" class="c-logo" aria-label="Project Periods home">
        <img class="c-um-mark" src="assets/img/um-mark-white.png" alt="Maastricht University">
        ${MARK("white")}
        <span class="c-word">Project Periods</span>
      </a>
      <div class="c-center">Faculty of Science and Engineering<br>Maastricht Science Programme</div>
      <nav class="c-nav">
        <a data-pane="menu" title="Menu (Alt+F1)"><i class="fa-solid fa-gears"></i> Dashboard</a>
        <a data-pane="help"><i class="fa-solid fa-circle-question"></i> Need help?</a>
      </nav>`;
    if (footer) footer.innerHTML = `
      <div>
        <a href="index.html">Dashboard</a> &nbsp;|&nbsp; <a href="projects.html">Projects</a> &nbsp;|&nbsp;
        <a href="submit.html">Offer a project</a> &nbsp;|&nbsp; <a href="admin.html">Committee</a>
        <div class="v">Project Periods 0.1 &nbsp;|&nbsp; FSE-MSP Project Committee &nbsp;|&nbsp; &copy; 2026 Maastricht University</div>
      </div>
      ${MARK("grey")}`;

    // panes
    const overlay = document.createElement("div");
    overlay.className = "c-overlay";
    const menu = document.createElement("aside");
    menu.className = "c-pane"; menu.id = "c-pane-menu"; menu.setAttribute("aria-label", "Menu");
    menu.innerHTML = `<div class="c-pane-head"><span><i class="fa-solid fa-gears"></i> Dashboard</span><button aria-label="Close" data-close>&times;</button></div>
      <div class="c-pane-body">${menuHTML()}<p class="c-hint" style="margin-top:22px"><span class="c-kbd">Alt</span> + <span class="c-kbd">F1</span> opens this menu, <span class="c-kbd">Esc</span> closes it.</p></div>`;
    const help = document.createElement("aside");
    help.className = "c-pane"; help.id = "c-pane-help"; help.setAttribute("aria-label", "Need help?");
    help.innerHTML = `<div class="c-pane-head"><span><i class="fa-solid fa-circle-question"></i> Need help?</span><button aria-label="Close" data-close>&times;</button></div>
      <div class="c-pane-body">${helpHTML(contact)}</div>`;
    document.body.append(overlay, menu, help);

    const panes = { menu, help };
    function openPane(name) {
      Object.keys(panes).forEach((k) => panes[k].classList.toggle("open", k === name));
      overlay.classList.add("open");
      document.body.classList.add("noscroll");
      panes[name].scrollTop = 0;
    }
    function closePanes() {
      Object.values(panes).forEach((p) => p.classList.remove("open"));
      overlay.classList.remove("open");
      document.body.classList.remove("noscroll");
    }
    function togglePane(name) { panes[name].classList.contains("open") ? closePanes() : openPane(name); }

    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-pane]");
      if (t) { e.preventDefault(); togglePane(t.dataset.pane); return; }
      if (e.target.closest("[data-close]") || e.target === overlay) closePanes();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanes();
      else if (e.altKey && e.key === "F1") { e.preventDefault(); togglePane("menu"); }
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
  }

  window.MSPChrome = { render, MARK, menuHTML };
})();
