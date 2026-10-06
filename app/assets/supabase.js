/* ==========================================================================
   MSP Project Periods - data layer (window.MSP)
   --------------------------------------------------------------------------
   One small API used by index / submit / admin. Two modes:
     "live"     Supabase configured in config.js: real catalogue, real
                submissions, committee dashboard.
     "preview"  config.js still holds the placeholders: the catalogue shows
                app/assets/demo-data.js and the form cannot submit.
   The same auth pattern as the tutoring tool (magic link + admin_user
   allow-list + Row-Level Security). See app/supabase/schema.sql.
   ========================================================================== */
(function () {
  const cfg = window.MSP_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");

  let client = null;
  if (configured && window.supabase) {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  const MSP = { mode: client ? "live" : "preview", isLive: !!client, client, config: cfg };

  // The committee's own three-digit numbering: 1xx, 2xx, 3xx, student-led 35x.
  MSP.LEVELS = ["1000", "2000", "3000"];
  MSP.LOCATIONS = [
    ["PHS", "Maastricht: PHS PBL rooms / PHS dry labs / field"],
    ["UM research group", "At a UM research group"],
    ["Company or elsewhere", "At a company or elsewhere"],
    ["DUB30 exclusively", "DUB30: MSP teaching labs (exclusively)"],
    ["DUB30 partially", "DUB30: MSP teaching labs (partially / only some analysis)"],
    ["DUB30 non-MSP labs", "DUB30: non-MSP labs (AMIBM, 3rd floor, etc.)"],
  ];
  MSP.LABS = ["Biology", "ML1", "Biochemistry", "Chemistry", "Physics", "PHS dry labs", "Other"];
  MSP.INSTRUMENTS = ["NMR", "GCMS", "LCMS", "UV-Vis", "Other"];
  MSP.FACILITIES = [
    ["ct_cabinets", "CT cabinets", "count"],
    ["fume_hoods", "Fume hoods", "count"],
    ["laminar_flow", "Laminar flow hoods", "count"],
    ["computers", "Computers / laptops", "text"],
    ["glovebox", "Glovebox", "bool"],
    ["rotavap", "Rota-vap", "bool"],
    ["dark_room", "Dark room", "bool"],
    ["other", "Other", "text"],
  ];

  function fail(error) {
    const raw = (error && (error.message || error.error_description || String(error))) || "Unknown error";
    const e = new Error(raw);
    e.code = (raw.split(":")[0] || "").trim();
    throw e;
  }

  // ---- periods --------------------------------------------------------------
  MSP.getPeriods = async function () {
    if (!client) return (window.MSP_DEMO && window.MSP_DEMO.periods) || [];
    const { data, error } = await client.from("period").select("*").order("sap_year", { ascending: false }).order("session", { ascending: false });
    if (error) fail(error);
    return data || [];
  };
  MSP.getOpenPeriod = async function () {
    const periods = await MSP.getPeriods();
    return periods.find((p) => p.submissions_open) || null;
  };

  // ---- the published catalogue (the booklet) -------------------------------------
  MSP.getCatalogue = async function (periodId) {
    if (!client) {
      const d = window.MSP_DEMO || { projects: [] };
      return d.projects.filter((p) => !periodId || p.period_id === periodId);
    }
    let q = client.from("project").select("*").eq("status", "approved").order("level").order("code");
    if (periodId) q = q.eq("period_id", periodId);
    const { data, error } = await q;
    if (error) fail(error);
    return data || [];
  };

  // ---- staff submission --------------------------------------------------------
  MSP.submitProject = async function (fields) {
    if (!client) { const e = new Error("PREVIEW_MODE"); e.code = "PREVIEW_MODE"; throw e; }
    const { data, error } = await client.rpc("submit_project", { p: fields });
    if (error) fail(error);
    return data;   // the new project's id
  };

  // ---- committee dashboard -------------------------------------------------------
  MSP.admin = {
    async signIn(email) {
      if (!client) throw new Error("Supabase not configured.");
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      if (error) fail(error);
    },
    async signOut() { if (client) await client.auth.signOut(); },
    async session() {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data.session;
    },
    onAuth(cb) { if (client) client.auth.onAuthStateChange((event, s) => cb(s, event)); },
    async isAllowed() {
      if (!client) return false;
      const { data, error } = await client.rpc("is_admin");
      if (error) fail(error);
      return !!data;
    },
    async listProjects(periodId) {
      let q = client.from("project").select("*").order("level").order("code", { nullsFirst: false }).order("created_at");
      if (periodId) q = q.eq("period_id", periodId);
      const { data, error } = await q;
      if (error) fail(error);
      return data || [];
    },
    async updateProject(id, patch) {
      patch = Object.assign({}, patch, { updated_at: new Date().toISOString() });
      const { error } = await client.from("project").update(patch).eq("id", id);
      if (error) fail(error);
    },
    async deleteProject(id) {
      const { error } = await client.from("project").delete().eq("id", id);
      if (error) fail(error);
    },
    async createProject(fields) {
      const { data, error } = await client.from("project").insert(fields).select().single();
      if (error) fail(error);
      return data;
    },
    async createPeriod(fields) {
      const { data, error } = await client.from("period").insert(fields).select().single();
      if (error) fail(error);
      return data;
    },
    async updatePeriod(id, patch) {
      const { error } = await client.from("period").update(patch).eq("id", id);
      if (error) fail(error);
    },
    async listAdmins() {
      const { data, error } = await client.from("admin_user").select("*").order("email");
      if (error) fail(error);
      return data || [];
    },
    async addAdmin(email) {
      const { error } = await client.from("admin_user").insert({ email: email.trim().toLowerCase() });
      if (error) fail(error);
    },
  };

  // ---- pure helpers (no network) -----------------------------------------------------
  // Next free code per level, continuing the committee's numbering. Student-led
  // projects take 351 upward, exactly as the ESD bibles show.
  MSP.nextCodes = function (projects) {
    const used = new Set(projects.map((p) => p.code).filter(Boolean));
    const start = { "1000": 101, "2000": 201, "3000": 301, slp: 351 };
    const cursor = Object.assign({}, start);
    return function (project) {
      const key = project.slp_leaders ? "slp" : project.level;
      let n = cursor[key];
      while (used.has(String(n))) n++;
      used.add(String(n));
      cursor[key] = n + 1;
      return String(n);
    };
  };

  // The bible in the allocator's clean CSV layout (allocator/readers.py reads it directly).
  MSP.bibleCSV = function (projects) {
    const labCols = ["PBL room", "DRY labs", "BIO", "ML1", "BIOCHEM", "Chem", "PHYsics", "PHY dark room", "BTR BIO", "Other location"];
    const labMap = { "Biology": "BIO", "ML1": "ML1", "Biochemistry": "BIOCHEM", "Chemistry": "Chem", "Physics": "PHYsics", "PHS dry labs": "DRY labs", "Other": "Other location" };
    const head = ["level", "code", "title", "supervisor", "supervisor_email", "co_supervisor", "co_supervisor_email", "slp",
      "external", "min", "max", "location", ...labCols, "equipment", "fume_hoods", "remarks", "status"];
    const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = [head.map(q).join(",")];
    projects.forEach((p) => {
      const labs = {};
      (p.labs || []).forEach((l) => { const k = labMap[l]; if (k) labs[k] = "X"; });
      if ((p.location || "").startsWith("PHS")) labs["PBL room"] = labs["PBL room"] || "X";
      const f = p.facilities || {};
      const equipment = [
        f.ct_cabinets ? `CT cabinet x${f.ct_cabinets}` : "", f.laminar_flow ? `laminar flow x${f.laminar_flow}` : "",
        f.computers ? `computers: ${f.computers}` : "", f.glovebox ? "glovebox" : "", f.rotavap ? "rota-vap" : "",
        f.dark_room ? "dark room" : "", f.other || "", (p.instruments || []).join(", "),
      ].filter(Boolean).join("; ");
      rows.push([p.level, p.code || "", p.title, p.supervisor, p.supervisor_email, p.co_supervisor || "", p.co_supervisor_email || "",
        p.slp_leaders || "", p.external ? "yes" : "", p.min_students, p.max_students, p.location || "",
        ...labCols.map((c) => labs[c] || ""), equipment, f.fume_hoods || "", p.committee_note || "",
        p.status === "closed" ? "closed" : "open"].map(q).join(","));
    });
    return rows.join("\r\n") + "\r\n";
  };

  // A printable booklet: one project per section, grouped by level.
  MSP.bookletHTML = function (projects, period) {
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const byLevel = {};
    projects.forEach((p) => (byLevel[p.level] = byLevel[p.level] || []).push(p));
    let body = "";
    MSP.LEVELS.forEach((lvl) => {
      const list = (byLevel[lvl] || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
      if (!list.length) return;
      body += `<h1 class="lvl">${lvl}-level projects</h1>`;
      list.forEach((p) => {
        const sups = [p.supervisor, p.co_supervisor].filter(Boolean).join(", ");
        const mails = [p.supervisor_email, p.co_supervisor_email].filter(Boolean).join(", ");
        body += `<section class="proj"><h2>${esc(p.code || "")}. ${esc(p.title)}</h2>
<p class="who">${esc(sups)}${mails ? " (" + esc(mails) + ")" : ""}${p.slp_leaders ? "<br>Student-led: " + esc(p.slp_leaders) : ""}${p.external ? "<br>External project" + (p.organisation ? ": " + esc(p.organisation) : "") : ""}</p>
<p class="meta">Level: ${esc(p.level)} &nbsp;&nbsp; Min - max number of students: ${esc(p.min_students)} - ${esc(p.max_students)} &nbsp;&nbsp; Location: ${esc(p.location || "")}</p>
<div class="desc">${esc(p.description || "").replace(/\n/g, "<br>")}</div>
${p.references ? `<p class="refs"><strong>References</strong><br>${esc(p.references).replace(/\n/g, "<br>")}</p>` : ""}
</section>`;
      });
    });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Project booklet ${esc(period ? period.label : "")}</title>
<style>body{font-family:Georgia,serif;max-width:800px;margin:30px auto;padding:0 20px;color:#111;line-height:1.45}
h1.lvl{page-break-before:always;font-size:26px;color:#001C3D;border-bottom:3px solid #E84E10;padding-bottom:6px}
.cover{text-align:center;padding:120px 0 80px}.cover h1{font-size:40px;color:#001C3D;margin:0}.cover p{font-size:20px;color:#444}
section.proj{page-break-inside:avoid;margin:28px 0}section.proj h2{font-size:18px;margin:0 0 4px;color:#001C3D}
.who{margin:0;font-size:14px}.meta{margin:4px 0 10px;font-size:13px;color:#444}.desc{font-size:14px;text-align:justify}.refs{font-size:12px;color:#333}
@media print{body{margin:0;max-width:none}}</style></head><body>
<div class="cover"><h1>Project booklet</h1><p>${esc(period ? period.label : "")}</p><p>Maastricht Science Programme</p></div>${body}</body></html>`;
  };

  MSP.download = function (filename, text, type) {
    const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  window.MSP = MSP;
})();
