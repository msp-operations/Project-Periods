/* ==========================================================================
   MSP Tutor Registration - UI niceties (count-up + confetti).
   Purely cosmetic and defensive: if anything is off it silently no-ops, and
   it fully respects prefers-reduced-motion. No app logic lives here.
   Exposes window.MSPUI = { countUp, confetti }.
   ========================================================================== */
(function () {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {};   // remembers the last value per stat key so we only animate real changes

  // Animate el's text from its last value to `to`. `key` persists across re-renders.
  function countUp(el, to, key) {
    to = Number(to) || 0;
    const from = key && key in store ? store[key] : 0;
    if (key) store[key] = to;
    if (reduce || from === to) { el.textContent = to; return; }
    const dur = Math.min(900, 260 + Math.abs(to - from) * 45);
    const start = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);               // easeOutCubic
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick); else el.textContent = to;
    })(start);
  }

  // A short, lightweight confetti burst (no library). Cleans itself up.
  function confetti(opts) {
    if (reduce) return;
    opts = opts || {};
    const n = opts.count || 90;
    const colors = ["#E84E10", "#001C3D", "#00A2DB", "#ff6a33", "#ffffff"];
    const wrap = document.createElement("div");
    wrap.className = "confetti";
    wrap.setAttribute("aria-hidden", "true");
    let life = 0;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      const delay = Math.random() * 220;
      const dur = 1500 + Math.random() * 1500;
      life = Math.max(life, delay + dur);
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = dur + "ms";
      p.style.animationDelay = delay + "ms";
      if (Math.random() < 0.3) p.style.borderRadius = "50%";
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), life + 250);
  }

  window.MSPUI = { countUp, confetti };
})();
