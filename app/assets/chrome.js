/* The shared page chrome (header bar, footer) so every page is identical.
   Call MSPChrome.render({ active: "dashboard" | "projects" | "submit" | "admin" }).
   The mark is the MSP emblem: white on the blue bar, grey in the footer
   (both tinted copies of assets/img/msp-logo.png). */
(function () {
  const MARK = (variant) => `<img class="c-mark" src="assets/img/msp-logo-${variant}.png" alt="Maastricht Science Programme">`;

  function render(opts) {
    const cfg = window.MSP_CONFIG || {};
    const contact = cfg.CONTACT_EMAIL || "msp-projects@maastrichtuniversity.nl";
    const header = document.getElementById("chrome-header");
    const footer = document.getElementById("chrome-footer");
    if (header) header.innerHTML = `
      <a href="index.html" class="c-logo" aria-label="Project Periods home">
        <span class="c-um">UM</span>
        ${MARK("white")}
        <span class="c-word">Project Periods</span>
      </a>
      <div class="c-center">Faculty of Science and Engineering<br>Maastricht Science Programme</div>
      <nav class="c-nav">
        <a href="index.html"><i class="fa-solid fa-gears"></i> Dashboard</a>
        <a href="mailto:${contact}"><i class="fa-solid fa-circle-question"></i> Need help?</a>
      </nav>`;
    if (footer) footer.innerHTML = `
      <div>
        <a href="index.html">Dashboard</a> &nbsp;|&nbsp; <a href="projects.html">Projects</a> &nbsp;|&nbsp;
        <a href="submit.html">Offer a project</a> &nbsp;|&nbsp; <a href="admin.html">Committee</a>
        <div class="v">Project Periods 0.1 &nbsp;|&nbsp; FSE-MSP Project Committee &nbsp;|&nbsp; &copy; 2026 Maastricht University</div>
      </div>
      ${MARK("grey")}`;
  }
  window.MSPChrome = { render, MARK };
})();
