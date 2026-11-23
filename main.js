/* =========================================================
   Aliya Haas — personal site
   1. Intro: binary-rain background + generative cell with a microscope lens
      and four clickable organelles that jump to projects
   2. Story: particles morphing patient/liver → protein → heart → ASLingo
   3. Page chrome: progress bar, reveals, jump links
   ========================================================= */

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = () => innerWidth <= 900;

// deterministic pseudo-random so layouts are stable between frames
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

function fitCanvas(canvas, dprCap = 2) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, dprCap);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height, dpr };
}

function runWhileVisible(el, frame) {
  let raf = 0, on = false;
  const loop = (t) => { frame(t / 1000); if (on) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    if (on && !raf) raf = requestAnimationFrame(loop);
    if (!on) { cancelAnimationFrame(raf); raf = 0; }
  }).observe(el);
}

// re-layout only when the size really changes (mobile URL bars fire resize on scroll)
function onResize(fn) {
  let w = innerWidth, h = innerHeight;
  addEventListener("resize", () => {
    if (innerWidth === w && Math.abs(innerHeight - h) < 120) return;
    w = innerWidth; h = innerHeight; fn();
  });
}

// scroll to one chapter of the story (0–3)
const LAST_STEP = 3;
function goToStep(s) {
  const section = document.getElementById("scales");
  const p = 0.03 + ((s + (s === LAST_STEP ? 0 : 0.2)) / LAST_STEP) * 0.94;
  scrollTo({ top: section.offsetTop + p * (section.offsetHeight - innerHeight), behavior: reduceMotion ? "auto" : "smooth" });
}

/* =========================================================
   1a. INTRO BACKGROUND — endless binary rain
   ========================================================= */
(function rain() {
  const canvas = document.getElementById("rain-canvas");
  let g, cols = [], acc = 0, lastT = 0;
  const TICK = 0.055;

  function layout() {
    g = fitCanvas(canvas, 1.5);
    const cw = isMobile() ? 15 : 17, n = Math.ceil(g.w / cw) + 1;
    cols = [];
    for (let i = 0; i < n; i++) {
      const r = rng(500 + i), depth = r(), size = Math.round(9 + depth * 7);
      cols.push({ x: i * cw + (r() - 0.5) * 3, size, lh: size * 1.18, depth, row: -Math.floor(r() * 40), speed: 0.3 + depth * 0.55 + r() * 0.25, acc: r(), r });
    }
    g.ctx.fillStyle = "#000"; g.ctx.fillRect(0, 0, g.w, g.h);
    for (let k = 0; k < 240; k++) tick(); // start with a full screen
  }

  function tick() {
    const { ctx, w, h } = g;
    ctx.fillStyle = "rgba(0,0,0,0.055)"; ctx.fillRect(0, 0, w, h);
    for (const c of cols) {
      c.acc += c.speed; if (c.acc < 1) continue; c.acc -= 1;
      ctx.font = `500 ${c.size}px "DM Mono", monospace`;
      if (c.row >= 0) { // the old head settles into the blue trail
        const y0 = c.row * c.lh;
        ctx.fillStyle = "#000"; ctx.fillRect(c.x - 1, y0 - c.size, c.size * 0.8, c.lh);
        ctx.fillStyle = `rgba(${(55 + c.depth * 45) | 0},${(100 + c.depth * 70) | 0},255,${0.3 + c.depth * 0.6})`;
        ctx.fillText(c.r() < 0.5 ? "0" : "1", c.x, y0);
      }
      c.row++;
      const y = c.row * c.lh;
      if (y - c.lh > h) { c.row = -Math.floor(c.r() * 30); continue; }
      if (c.row >= 0) { ctx.fillStyle = `rgba(215,230,255,${0.5 + c.depth * 0.5})`; ctx.fillText(c.r() < 0.5 ? "0" : "1", c.x, y); }
    }
  }

  function frame(t) {
    if (reduceMotion) return;
    if (!lastT) lastT = t;
    acc += Math.min(0.1, t - lastT); lastT = t;
    while (acc > TICK) { tick(); acc -= TICK; }
  }

  layout();
  onResize(layout);
  runWhileVisible(canvas, frame);
})();

/* =========================================================
   1b. INTRO — generative cell, microscope lens, project organelles
   ========================================================= */
(function intro() {
  const canvas = document.getElementById("cell-canvas");
  const intro = canvas.closest(".intro");
  let g, bgLayer, orgLayer, S, R, cx, cy;
  const mouse = { x: -1e4, y: -1e4, sx: 0, sy: 0, in: false };
  const LENS_R = 96, ZOOM = 2.6, ENLARGE = 1.6;

  /* ---- organelle layout in cell units (radius 1, centre 0) ---- */
  const NUC = { x: 0.04, y: -0.03, rx: 0.36, ry: 0.31, rot: -0.2 };
  const GA = -0.75; // direction of the Golgi from the nucleus
  const GOLGI = { x: NUC.x + Math.cos(GA) * 0.6, y: NUC.y + Math.sin(GA) * 0.6, rot: GA - Math.PI / 2, ves: [] };
  const ER_RANGE = [1.0, 4.4]; // angles (nucleus frame) wrapped by rough ER

  const nucFrame = (x, y) => { // → [normalised radius, angle] around the nucleus
    const dx = x - NUC.x, dy = y - NUC.y, c = Math.cos(-NUC.rot), s = Math.sin(-NUC.rot);
    const lx = (dx * c - dy * s) / NUC.rx, ly = (dx * s + dy * c) / NUC.ry;
    let th = Math.atan2(ly, lx); if (th < 0) th += TAU;
    return [Math.hypot(lx, ly), th];
  };
  const nucPoint = (sc, th) => {
    const lx = NUC.rx * sc * Math.cos(th), ly = NUC.ry * sc * Math.sin(th), c = Math.cos(NUC.rot), s = Math.sin(NUC.rot);
    return [NUC.x + lx * c - ly * s, NUC.y + lx * s + ly * c];
  };

  const ORG = (() => {
    const r = rng(21), list = [];
    const ok = (x, y, rad) => {
      if (Math.hypot(x, y) + rad > 0.88) return false;
      if (nucFrame(x, y)[0] < 1.75) return false;
      if (Math.hypot(x - GOLGI.x, y - GOLGI.y) < 0.2 + rad) return false;
      return list.every((o) => Math.hypot(o.x - x, o.y - y) > (o.rad + rad) * 1.5);
    };
    const place = (n, make) => {
      for (let k = 0, tries = 0; k < n && tries < 5000; tries++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.86, o = make(Math.cos(a) * d, Math.sin(a) * d);
        if (ok(o.x, o.y, o.rad)) { list.push(o); k++; }
      }
    };
    place(16, (x, y) => { const L = 0.05 + r() * 0.03; return { type: "mito", x, y, rot: r() * Math.PI, L, w: 0.022 + r() * 0.008, rad: L }; });
    place(7, (x, y) => { const rad = 0.045 + r() * 0.03; return { type: "vac", x, y, rad, dots: Array.from({ length: 3 + ((r() * 4) | 0) }, () => [(r() - 0.5) * rad * 1.1, (r() - 0.5) * rad * 1.1, 0.06 + r() * 0.08]) }; });
    place(70, (x, y) => ({ type: "ves", x, y, rad: 0.008 + r() * 0.014, c: r() < 0.5 }));
    for (let k = 0; k < 12; k++) {
      GOLGI.ves.push(k < 7 ? [(r() - 0.5) * 0.22, 0.17 + r() * 0.07, 0.008 + r() * 0.006] : [(r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.03), 0.02 + r() * 0.09, 0.007 + r() * 0.005]);
    }
    return list;
  })();

  /* ---- organelle drawing (ctx already in cell units; px = one screen pixel) ---- */
  function drawMito(x, o, E, px) {
    x.save(); x.translate(o.x, o.y); x.rotate(o.rot); x.scale(E, E);
    const L = o.L, W = o.w; x.lineWidth = (px * 1.2) / E;
    x.fillStyle = "rgba(95,212,230,0.14)"; x.strokeStyle = "rgba(130,230,245,0.85)";
    x.beginPath(); x.ellipse(0, 0, L, W, 0, 0, TAU); x.fill(); x.stroke();
    x.strokeStyle = "rgba(95,212,230,0.6)";
    x.beginPath(); x.ellipse(0, 0, L * 0.86, W * 0.7, 0, 0, TAU); x.stroke();
    x.beginPath();
    const n = Math.max(4, Math.round((L / W) * 2.4));
    for (let k = 1; k < n; k++) { // cristae folds
      const xx = -L * 0.8 + (k / n) * L * 1.6, edge = W * 0.7 * Math.sqrt(Math.max(0, 1 - (xx / (L * 0.86)) ** 2)), sg = k % 2 ? -1 : 1;
      x.moveTo(xx, sg * edge); x.quadraticCurveTo(xx + W * 0.25, sg * edge * 0.3, xx, -sg * edge * 0.3);
    }
    x.stroke(); x.restore();
  }
  function drawVac(x, o, E, px) {
    x.save(); x.translate(o.x, o.y); x.scale(E, E); x.lineWidth = (px * 1.2) / E;
    x.fillStyle = "rgba(164,147,255,0.1)"; x.strokeStyle = "rgba(200,190,255,0.75)";
    x.beginPath(); x.arc(0, 0, o.rad, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = "rgba(200,190,255,0.45)";
    for (const [dx, dy, s] of o.dots) { x.beginPath(); x.arc(dx, dy, o.rad * s, 0, TAU); x.fill(); }
    x.strokeStyle = "rgba(255,255,255,0.3)"; x.beginPath(); x.arc(0, 0, o.rad * 0.72, 3.6, 4.6); x.stroke();
    x.restore();
  }
  function drawVes(x, o, E, px) {
    x.lineWidth = px * 1.1; x.strokeStyle = o.c ? "rgba(95,212,230,0.6)" : "rgba(255,130,175,0.55)";
    x.beginPath(); x.arc(o.x, o.y, o.rad * E, 0, TAU); x.stroke();
  }
  function drawGolgi(x, E, px) {
    x.save(); x.translate(GOLGI.x, GOLGI.y); x.rotate(GOLGI.rot); x.scale(E, E); x.lineCap = "round";
    [0.09, 0.105, 0.11, 0.1, 0.08].forEach((L, k) => { // stacked cisternae, convex toward the nucleus
      const y0 = k * 0.03;
      x.beginPath();
      for (let i = 0; i <= 24; i++) { const xx = -L + (2 * L * i) / 24; x.lineTo(xx, y0 + 3 * xx * xx); }
      x.lineWidth = 0.015; x.strokeStyle = "rgba(255,190,100,0.75)"; x.stroke();
      x.lineWidth = 0.007; x.strokeStyle = "rgba(40,20,0,0.75)"; x.stroke();
      x.fillStyle = "rgba(255,181,71,0.7)";
      [-L, L].forEach((xx) => { x.beginPath(); x.arc(xx, y0 + 3 * xx * xx, 0.011, 0, TAU); x.fill(); });
    });
    x.lineWidth = (px * 1.2) / E; x.strokeStyle = "rgba(255,200,120,0.8)";
    for (const [vx, vy, vr] of GOLGI.ves) { x.beginPath(); x.arc(vx, vy, vr, 0, TAU); x.stroke(); }
    x.restore();
  }
  function drawER(x, px, detail) {
    x.lineCap = "round";
    for (let j = 0; j < 4; j++) {
      const a0 = ER_RANGE[0] + j * 0.12, a1 = ER_RANGE[1] - j * 0.2, sc = (th) => (1.14 + j * 0.13) * (1 + 0.035 * Math.sin(th * 12 + j * 1.3));
      x.beginPath();
      for (let th = a0; th <= a1; th += 0.03) { const [ex, ey] = nucPoint(sc(th), th); th === a0 ? x.moveTo(ex, ey) : x.lineTo(ex, ey); }
      x.lineWidth = 0.016; x.strokeStyle = "rgba(170,150,255,0.55)"; x.stroke();
      x.lineWidth = 0.007; x.strokeStyle = "rgba(0,0,0,0.6)"; x.stroke();
      x.fillStyle = "rgba(255,190,100,0.85)"; // ribosomes studding the membrane
      for (let th = a0; th <= a1; th += detail ? 0.03 : 0.06) {
        const [rx, ry] = nucPoint(sc(th) + 0.035, th);
        x.beginPath(); x.arc(rx, ry, detail ? 0.0045 : Math.max(0.0035, px * 0.9), 0, TAU); x.fill();
      }
    }
  }

  /* ---- the four organelles that link to projects ---- */
  const LINKS = [
    { step: 0, label: "scPrediXcan", kind: "secretory", col: "255,181,71" },
    { step: 1, label: "JCAST-HF", kind: "ribosome", col: "164,147,255" },
    { step: 2, label: "AGING HEART", kind: "mito", col: "255,122,144" },
    { step: 3, label: "ASLINGO", kind: "lyso", col: "253,193,214" },
  ];
  const LR = 0.075;
  const linkState = [];
  let hovered = null;
  const linkPos = (k, t) => {
    const tt = reduceMotion ? 0 : t, a = (k * Math.PI) / 2 + 0.55 + tt * 0.04, d = 0.7 + 0.05 * Math.sin(tt * 0.45 + k * 1.7);
    return [Math.cos(a) * d, Math.sin(a) * d * 0.96, a];
  };

  function drawLink(x, L, ux, uy, t, px, hover, glow = true) {
    const s = LR * (hover ? 1.22 : 1), tt = reduceMotion ? 0 : t;
    x.save(); x.translate(ux, uy);
    const gl = x.createRadialGradient(0, 0, 0, 0, 0, s * 2.4);
    gl.addColorStop(0, `rgba(${L.col},${hover ? 0.5 : 0.32})`); gl.addColorStop(1, `rgba(${L.col},0)`);
    if (glow) { x.fillStyle = gl; x.beginPath(); x.arc(0, 0, s * 2.4, 0, TAU); x.fill(); }
    x.lineWidth = px * 1.6; x.strokeStyle = `rgba(${L.col},0.95)`; x.fillStyle = `rgba(${L.col},0.16)`;
    const dot = (dx, dy, r, a = 0.9) => { x.fillStyle = `rgba(${L.col},${a})`; x.beginPath(); x.arc(dx, dy, r, 0, TAU); x.fill(); };
    if (L.kind === "secretory") { // vesicle full of plasma proteins
      x.beginPath(); x.arc(0, 0, s, 0, TAU); x.fill(); x.stroke();
      for (let i = 0; i < 8; i++) { const a = i * 0.8 + tt * 0.5, rr = s * (0.2 + (i % 3) * 0.22); dot(Math.cos(a) * rr, Math.sin(a) * rr, s * 0.1); }
    } else if (L.kind === "ribosome") { // two subunits on an mRNA, peptide emerging
      x.beginPath(); x.ellipse(0, -s * 0.2, s * 0.95, s * 0.62, 0, 0, TAU); x.fill(); x.stroke();
      x.beginPath(); x.ellipse(0, s * 0.52, s * 0.72, s * 0.36, 0, 0, TAU); x.fill(); x.stroke();
      x.beginPath(); for (let i = 0; i <= 20; i++) { const xx = -s * 1.5 + (i / 20) * s * 3; i ? x.lineTo(xx, s * 0.2 + Math.sin(i * 1.3 + tt * 3) * s * 0.05) : x.moveTo(xx, s * 0.2); } x.stroke();
      for (let i = 0; i < 6; i++) dot(Math.sin(i * 1.2 + tt * 2) * s * 0.25, -s * 0.9 - i * s * 0.22, s * 0.09);
    } else if (L.kind === "mito") {
      x.rotate(0.4 + tt * 0.15);
      x.beginPath(); x.ellipse(0, 0, s * 1.3, s * 0.62, 0, 0, TAU); x.fill(); x.stroke();
      x.beginPath(); for (let k = 1; k < 7; k++) { const xx = -s * 1.05 + k * s * 0.3, sg = k % 2 ? -1 : 1; x.moveTo(xx, sg * s * 0.42); x.lineTo(xx, -sg * s * 0.08); } x.stroke();
    } else { // lysosome
      x.beginPath(); x.arc(0, 0, s, 0, TAU); x.fill(); x.stroke();
      x.beginPath(); x.arc(0, 0, s * 0.78, 0, TAU); x.globalAlpha = 0.5; x.stroke(); x.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { const a = i * 1.05 - tt * 0.4; dot(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42, s * 0.12, 0.7); }
    }
    if (hover) {
      x.setLineDash([px * 4, px * 4]); x.lineDashOffset = -tt * 0.05 / px;
      x.beginPath(); x.arc(0, 0, s * 1.75, 0, TAU); x.stroke(); x.setLineDash([]);
    }
    x.restore();
  }

  function drawLabels(ctx, Rs) {
    ctx.font = "500 9.5px DM Mono, monospace";
    LINKS.forEach((L, k) => {
      const st = linkState[k], hov = hovered === L, txt = `${L.label} →`, tw = ctx.measureText(txt).width + 16;
      const off = LR * Rs * 1.9 + 8, right = Math.cos(st.a) >= 0;
      let lx = st.sx + Math.cos(st.a) * off, ly = st.sy + Math.sin(st.a) * off * 0.6;
      lx = right ? lx : lx - tw;
      lx = clamp(lx, 8, g.w - tw - 8);
      st.rect = [lx, ly - 10, tw, 20];
      ctx.fillStyle = hov ? `rgba(${L.col},0.22)` : "rgba(0,0,0,0.7)";
      ctx.strokeStyle = `rgba(${L.col},${hov ? 1 : 0.55})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ly - 10, tw, 20, 10) : ctx.rect(lx, ly - 10, tw, 20); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hov ? "#fff" : `rgba(${L.col},1)`;
      ctx.fillText(txt, lx + 8, ly + 3.5);
    });
  }

  function hit(mx, my) {
    if (!g || !linkState.length) return null;
    for (let k = 0; k < LINKS.length; k++) {
      const st = linkState[k], rad = Math.max(20, LR * R * 1.6);
      if (Math.hypot(mx - st.sx, my - st.sy) < rad) return LINKS[k];
      const [x, y, w, h] = st.rect || [0, 0, 0, 0];
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) return LINKS[k];
    }
    return null;
  }

  /* ---- pre-render the static cell into two layers: background + organelles ---- */
  function renderCell() {
    const dpr = Math.min(devicePixelRatio || 1, 2), size = Math.round(S * dpr);
    const mk = () => { const c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d"); x.scale(dpr, dpr); return [c, x]; };
    const [bc, x] = mk(), r = rng(7), m = S / 2;
    const wob = (a, p1, p2) => 1 + 0.028 * Math.sin(5 * a + p1) + 0.018 * Math.sin(11 * a + p2) + 0.01 * Math.sin(17 * a);

    // black backing so the binary rain doesn't show through the cell
    let gr = x.createRadialGradient(m, m, R * 0.9, m, m, R * 1.3);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gr; x.beginPath(); x.arc(m, m, R * 1.3, 0, TAU); x.fill();
    gr = x.createRadialGradient(m, m, R * 0.85, m, m, R * 1.22);
    gr.addColorStop(0, "rgba(255,110,160,0.14)"); gr.addColorStop(1, "rgba(255,110,160,0)");
    x.fillStyle = gr; x.beginPath(); x.arc(m, m, R * 1.22, 0, TAU); x.fill();

    // cytoplasm
    gr = x.createRadialGradient(m, m, R * 0.1, m, m, R);
    gr.addColorStop(0, "rgba(255,160,195,0.08)"); gr.addColorStop(0.7, "rgba(255,140,185,0.12)"); gr.addColorStop(1, "rgba(255,120,170,0.22)");
    x.fillStyle = gr; x.beginPath();
    for (let i = 0; i <= 200; i++) { const a = (i / 200) * TAU, rr = R * wob(a, 0.3, 1.2); x.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); }
    x.fill();

    // cytoskeleton filaments
    for (let i = 0; i < 240; i++) {
      const a1 = r() * TAU, r1 = R * (0.35 + r() * 0.6), a2 = a1 + (r() - 0.5) * 1.6, r2 = R * (0.3 + r() * 0.65);
      x.strokeStyle = r() < 0.7 ? `rgba(255,120,170,${0.06 + r() * 0.12})` : `rgba(95,212,230,${0.07 + r() * 0.12})`;
      x.lineWidth = 0.4 + r() * 0.8;
      x.beginPath(); x.moveTo(m + Math.cos(a1) * r1, m + Math.sin(a1) * r1);
      x.quadraticCurveTo(m + Math.cos((a1 + a2) / 2 + 0.4) * R * r(), m + Math.sin((a1 + a2) / 2 + 0.4) * R * r(), m + Math.cos(a2) * r2, m + Math.sin(a2) * r2);
      x.stroke();
    }
    // membrane (multiple wobbly passes)
    for (let k = 0; k < 7; k++) {
      x.strokeStyle = `rgba(255,140,185,${0.14 + k * 0.07})`; x.lineWidth = 0.6 + r() * 1.6;
      x.beginPath();
      const p1 = r() * 0.4, p2 = 1.2 + r() * 0.4, off = 1 - k * 0.006;
      for (let i = 0; i <= 260; i++) { const a = (i / 260) * TAU, rr = R * off * wob(a, p1, p2); x.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); }
      x.stroke();
    }
    // nucleus
    const nx = m + NUC.x * R, ny = m + NUC.y * R, nrx = NUC.rx * R, nry = NUC.ry * R;
    gr = x.createRadialGradient(nx, ny, 0, nx, ny, nrx);
    gr.addColorStop(0, "rgba(150,130,255,0.32)"); gr.addColorStop(1, "rgba(110,90,230,0.2)");
    x.fillStyle = gr; x.beginPath(); x.ellipse(nx, ny, nrx, nry, NUC.rot, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.ellipse(nx, ny, nrx, nry, NUC.rot, 0, TAU); x.clip();
    for (let i = 0; i < 1300; i++) { // chromatin mesh
      const px = nx + (r() - 0.5) * nrx * 2, py = ny + (r() - 0.5) * nry * 2;
      x.strokeStyle = `rgba(${150 + r() * 60},${130 + r() * 50},255,${0.12 + r() * 0.28})`; x.lineWidth = 0.5;
      x.beginPath(); x.arc(px, py, 1 + r() * 4, r() * 6, r() * 6 + 2 + r() * 3); x.stroke();
    }
    x.fillStyle = "rgba(190,170,255,0.35)"; x.beginPath(); x.ellipse(nx + nrx * 0.25, ny - nry * 0.15, nrx * 0.2, nry * 0.18, 0.5, 0, TAU); x.fill();
    x.restore();
    x.strokeStyle = "rgba(190,175,255,0.85)"; x.lineWidth = 1.8; x.beginPath(); x.ellipse(nx, ny, nrx, nry, NUC.rot, 0, TAU); x.stroke();
    for (let i = 0; i < 28; i++) { // nuclear pores
      const [px, py] = nucPoint(1, (i / 28) * TAU + 0.1);
      x.fillStyle = "rgba(0,0,0,0.9)"; x.beginPath(); x.arc(m + px * R, m + py * R, 1.6, 0, TAU); x.fill();
      x.strokeStyle = "rgba(220,210,255,0.7)"; x.lineWidth = 0.6; x.beginPath(); x.arc(m + px * R, m + py * R, 2.4, 0, TAU); x.stroke();
    }

    // organelles on their own layer, so the lens can redraw them larger
    const [oc, o] = mk();
    o.translate(m, m); o.scale(R, R);
    const px = 1 / R;
    drawER(o, px, false); drawGolgi(o, 1, px);
    for (const q of ORG) q.type === "mito" ? drawMito(o, q, 1, px) : q.type === "vac" ? drawVac(o, q, 1, px) : drawVes(o, q, 1, px);
    bgLayer = bc; orgLayer = oc;
  }

  // a few live vesicles drifting on top of the static render
  const live = Array.from({ length: 30 }, (_, i) => { const r = rng(100 + i); return { a: r() * TAU, rr: 0.5 + r() * 0.38, sp: (0.02 + r() * 0.06) * (r() < 0.5 ? -1 : 1), s: 1.5 + r() * 2.5, c: r() < 0.5 }; });

  function layout() {
    g = fitCanvas(canvas);
    if (isMobile()) { S = Math.min(g.w * 1.0, g.h * 0.52); cx = g.w * 0.5; cy = g.h * 0.29; }
    else { S = Math.min(g.h * 0.92, g.w * 0.5); cx = g.w * 0.72; cy = g.h * 0.52; }
    R = S * 0.4;
    renderCell();
  }

  function region(ux, uy, d) {
    if (nucFrame(ux, uy)[0] < 1) return "NUCLEUS · DNA";
    if (d > 0.93) return "MEMBRANE";
    if (Math.hypot(ux - GOLGI.x, uy - GOLGI.y) < 0.19) return "GOLGI APPARATUS";
    for (const q of ORG) {
      if (q.type === "mito") {
        const c = Math.cos(-q.rot), s = Math.sin(-q.rot), lx = (ux - q.x) * c - (uy - q.y) * s, ly = (ux - q.x) * s + (uy - q.y) * c;
        if ((lx / (q.L * ENLARGE)) ** 2 + (ly / (q.w * ENLARGE)) ** 2 < 1) return "MITOCHONDRION";
      } else if (Math.hypot(ux - q.x, uy - q.y) < q.rad * ENLARGE + 0.008) return q.type === "vac" ? "VACUOLE" : "VESICLE";
    }
    const [sc, th] = nucFrame(ux, uy);
    if (sc < 1.65 && th > ER_RANGE[0] - 0.05 && th < ER_RANGE[1] + 0.05) return "ROUGH ENDOPLASMIC RETICULUM";
    return "CYTOPLASM";
  }

  const SEQ = "ATGGCGTACCTGAAGTTCGACCATGGTTAGCCGTACGATTGCAAGTCCGATGCATTACGGAT";
  const BASE = { A: "#5fd4e6", T: "#ff7a90", C: "#ffb547", G: "#a493ff" };

  function frame(t) {
    const { ctx, w, h } = g;
    ctx.clearRect(0, 0, w, h);
    mouse.sx = lerp(mouse.sx, mouse.in ? (mouse.x - cx) / w : 0, 0.05);
    mouse.sy = lerp(mouse.sy, mouse.in ? (mouse.y - cy) / h : 0, 0.05);
    const breath = reduceMotion ? 1 : 1 + 0.012 * Math.sin(t * 0.9);
    const ox = cx - mouse.sx * 30, oy = cy - mouse.sy * 30;
    const sz = S * breath, Rs = R * breath;
    ctx.globalAlpha = isMobile() ? 0.85 : 1;
    ctx.drawImage(bgLayer, ox - sz / 2, oy - sz / 2, sz, sz);
    ctx.drawImage(orgLayer, ox - sz / 2, oy - sz / 2, sz, sz);
    for (const v of live) {
      if (!reduceMotion) v.a += v.sp * 0.016;
      const px = ox + Math.cos(v.a) * Rs * v.rr, py = oy + Math.sin(v.a) * Rs * v.rr;
      ctx.fillStyle = v.c ? "rgba(95,212,230,.6)" : "rgba(255,130,175,.55)";
      ctx.beginPath(); ctx.arc(px, py, v.s, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // project organelles
    hovered = mouse.in ? hit(mouse.x, mouse.y) : null;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(Rs, Rs);
    LINKS.forEach((L, k) => {
      const [ux, uy, a] = linkPos(k, t);
      linkState[k] = { ...linkState[k], ux, uy, a, sx: ox + ux * Rs, sy: oy + uy * Rs };
      drawLink(ctx, L, ux, uy, t, 1 / Rs, hovered === L);
    });
    ctx.restore();
    drawLabels(ctx, Rs);

    // microscope lens
    const dx = mouse.x - ox, dy = mouse.y - oy, dist = Math.hypot(dx, dy);
    if (mouse.in && !hovered && dist < R * 1.1 && !isMobile()) {
      const ux = dx / Rs, uy = dy / Rs, view = LENS_R / (Rs * ZOOM);
      ctx.save();
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, LENS_R, 0, TAU); ctx.clip();
      ctx.fillStyle = "#000"; ctx.fillRect(mouse.x - LENS_R, mouse.y - LENS_R, LENS_R * 2, LENS_R * 2);
      const zs = sz * ZOOM;
      ctx.drawImage(bgLayer, mouse.x - (dx / sz + 0.5) * zs, mouse.y - (dy / sz + 0.5) * zs, zs, zs);
      // organelles re-drawn larger and in more detail
      ctx.save(); ctx.translate(mouse.x - dx * ZOOM, mouse.y - dy * ZOOM); ctx.scale(Rs * ZOOM, Rs * ZOOM);
      const px = 1 / (Rs * ZOOM), near = (x, y, rad) => Math.hypot(x - ux, y - uy) < view + rad;
      if (near(NUC.x, NUC.y, 0.75)) drawER(ctx, px, true);
      if (near(GOLGI.x, GOLGI.y, 0.3)) drawGolgi(ctx, 1.35, px);
      for (const q of ORG) {
        if (!near(q.x, q.y, (q.rad || 0.08) * ENLARGE)) continue;
        q.type === "mito" ? drawMito(ctx, q, ENLARGE, px) : q.type === "vac" ? drawVac(ctx, q, ENLARGE, px) : drawVes(ctx, q, ENLARGE, px);
      }
      LINKS.forEach((L, k) => { const st = linkState[k]; if (near(st.ux, st.uy, LR * 2.5)) drawLink(ctx, L, st.ux, st.uy, t, px, false, false); });
      ctx.restore();
      // inside the nucleus, resolve down to sequence
      const inNuc = nucFrame(ux, uy)[0] < 1;
      if (inNuc) {
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(mouse.x - LENS_R, mouse.y - LENS_R, LENS_R * 2, LENS_R * 2);
        ctx.font = "500 13px DM Mono, monospace";
        const shift = Math.floor(t * 6);
        for (let row = -4; row <= 4; row++) {
          for (let col = -7; col <= 7; col++) {
            const b = SEQ[Math.abs(row * 17 + col + shift + 999) % SEQ.length];
            ctx.fillStyle = BASE[b];
            ctx.fillText(b, mouse.x + col * 12 - 4, mouse.y + row * 19 + 5);
          }
        }
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(226,237,255,.9)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, LENS_R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(226,237,255,.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, LENS_R + 7, 0, TAU); ctx.stroke();
      for (let k = 0; k < 4; k++) { // crosshair ticks
        const a = (k * Math.PI) / 2;
        ctx.beginPath(); ctx.moveTo(mouse.x + Math.cos(a) * (LENS_R - 10), mouse.y + Math.sin(a) * (LENS_R - 10)); ctx.lineTo(mouse.x + Math.cos(a) * (LENS_R + 12), mouse.y + Math.sin(a) * (LENS_R + 12)); ctx.stroke();
      }
      ctx.font = "500 10px DM Mono, monospace"; ctx.fillStyle = "rgba(226,237,255,.95)";
      ctx.fillText(`×${ZOOM} · ${region(ux, uy, dist / Rs)}`, mouse.x - LENS_R + 4, mouse.y + LENS_R + 26);
      canvas.style.cursor = "none";
    } else canvas.style.cursor = hovered ? "pointer" : "default";
  }

  const toLocal = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  intro.addEventListener("pointermove", (e) => { [mouse.x, mouse.y] = toLocal(e); mouse.in = true; });
  intro.addEventListener("pointerleave", () => { mouse.in = false; });
  canvas.addEventListener("click", (e) => { const L = hit(...toLocal(e)); if (L) goToStep(L.step); });
  layout();
  onResize(layout);
  runWhileVisible(canvas, frame);
})();

/* =========================================================
   2. STORY — morphing particle field
   ========================================================= */
(function story() {
  const section = document.getElementById("scales");
  const canvas = document.getElementById("story-canvas");
  const chapters = [...document.querySelectorAll(".chapter")];
  const railDots = [...document.querySelectorAll("#depth-rail > i")];
  const railProgress = document.getElementById("rail-progress");
  const hud = {
    modality: document.getElementById("modality-label"),
    value: document.getElementById("scale-value"),
    name: document.getElementById("scale-name"),
    context: document.getElementById("scale-context"),
  };
  const STATES = [
    { modality: "NEURAL NETWORKS · LIVER scRNA-seq → PLASMA", value: "17", name: "LIVER CELL-TYPE MODELS", context: "MEAN SPEARMAN ρ ≈ 0.80" },
    { modality: "STAR · rMATS · JCAST · MASS SPEC", value: "RNA → protein", name: "PERSONALIZED PROTEIN DATABASES", context: "LVAD · HEART FAILURE" },
    { modality: "TRANSCRIPTOMICS · CARDIAC AGING", value: "BubR1", name: "HEART FAILURE PATHWAYS", context: "ORGAN SCALE" },
    { modality: "MEDIAPIPE HAND LANDMARKS · COMPUTER VISION", value: "ASL", name: "VISUAL-FIRST LEARNING", context: "SIDE PROJECT" },
  ];

  const COL = {
    mint: [95, 212, 230], signal: [58, 108, 255], violet: [164, 147, 255], amber: [255, 181, 71],
    coral: [255, 122, 144], rose: [255, 170, 185], ivory: [214, 226, 255], pale: [150, 170, 210],
  };

  let g, W, H, U, CX, CY, N;
  let parts = [];
  const mouse = { x: -1e4, y: -1e4 };

  /* ---------- patient silhouette ---------- */
  const body = (() => {
    const c = document.createElement("canvas").getContext("2d");
    const p = new Path2D(), limbs = new Path2D();
    p.arc(0, -80, 13, 0, TAU);
    p.moveTo(-26, -58); p.quadraticCurveTo(0, -66, 26, -58); p.lineTo(22, 8); p.quadraticCurveTo(0, 14, -22, 8); p.closePath();
    p.rect(-5, -68, 10, 12);
    limbs.moveTo(-26, -55); limbs.lineTo(-36, -14); limbs.lineTo(-42, 26);
    limbs.moveTo(26, -55); limbs.lineTo(36, -14); limbs.lineTo(42, 26);
    limbs.moveTo(-12, 6); limbs.lineTo(-15, 50); limbs.lineTo(-16, 94);
    limbs.moveTo(12, 6); limbs.lineTo(15, 50); limbs.lineTo(16, 94);
    c.lineWidth = 12; c.lineCap = "round"; c.lineJoin = "round";
    const r = rng(9), pts = [];
    while (pts.length < 1400) {
      const x = (r() - 0.5) * 100, y = (r() - 0.5) * 200;
      if (c.isPointInPath(p, x, y) || c.isPointInStroke(limbs, x, y)) pts.push([x / 100, y / 100]);
    }
    return pts;
  })();

  /* ---------- protein: one chain with two helices and a three-strand sheet ---------- */
  const PROT = (() => {
    const NR = 96, ss = Array(NR).fill("loop"), F0 = [], UF = [];
    const helixSeg = (i0, n, ax, y0, y1, ph) => { for (let k = 0; k < n; k++) { const a = (k * TAU) / 3.6 + ph; F0[i0 + k] = [ax + 0.1 * Math.cos(a), lerp(y0, y1, k / (n - 1)), 0.1 * Math.sin(a)]; ss[i0 + k] = "helix"; } };
    const strand = (i0, n, ax, y0, y1) => { for (let k = 0; k < n; k++) { F0[i0 + k] = [ax + (k % 2 ? 0.02 : -0.02), lerp(y0, y1, k / (n - 1)), 0.06 + (k % 2 ? 0.025 : -0.025)]; ss[i0 + k] = "sheet"; } };
    helixSeg(0, 22, -0.55, -0.5, 0.5, 0);
    helixSeg(28, 22, -0.22, 0.5, -0.5, 1.2);
    strand(56, 10, 0.12, -0.42, 0.42);
    strand(69, 10, 0.3, 0.42, -0.42);
    strand(82, 10, 0.48, -0.42, 0.42);
    const loop = (i0, i1, bulge) => {
      const a = F0[i0 - 1], b = F0[i1 + 1], n = i1 - i0 + 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + bulge, (a[2] + b[2]) / 2 - 0.12];
      for (let k = 0; k < n; k++) { const u = (k + 1) / (n + 1); F0[i0 + k] = [0, 1, 2].map((j) => (1 - u) * (1 - u) * a[j] + 2 * (1 - u) * u * m[j] + u * u * b[j]); }
    };
    loop(22, 27, 0.24); loop(50, 55, -0.24); loop(66, 68, 0.14); loop(79, 81, -0.14);
    for (let k = 92; k < NR; k++) { const u = k - 91; F0[k] = [0.48 + u * 0.05, 0.42 + u * 0.06, 0.06 - u * 0.03]; }
    const mean = [0, 1, 2].map((j) => F0.reduce((s, p) => s + p[j], 0) / NR);
    F0.forEach((p) => { for (let j = 0; j < 3; j++) p[j] -= mean[j]; });
    for (let i = 0; i < NR; i++) UF[i] = [-1.05 + (2.1 * i) / (NR - 1), 0.26 * Math.sin(i * 0.19 + 0.6) + 0.09 * Math.sin(i * 0.57), 0.25 * Math.sin(i * 0.13 + 1)];
    // secondary structure forms first, then the sheet, then loops settle
    const delay = ss.map((s, i) => (s === "helix" ? 0 : s === "sheet" ? 0.28 : 0.42) + rng(900 + i)() * 0.08);
    return { NR, ss, F0, UF, delay, res: Array.from({ length: NR }, () => ({ x: 0, y: 0, z: 0 })), disp: Array.from({ length: NR }, () => [0, 0]), F: 0 };
  })();
  const SSCOL = { helix: COL.violet, sheet: COL.amber, loop: COL.mint };

  function computeProtein(t) {
    const P = PROT;
    let F = 1;
    if (!reduceMotion) { const c = t % 16; F = c < 2.5 ? 0 : c < 8 ? smoothstep(2.5, 8, c) : c < 13 ? 1 : 1 - smoothstep(13, 16, c); }
    P.F = F;
    const rot = reduceMotion ? 0.4 : 0.5 * Math.sin(t * 0.22), tilt = 0.32;
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    const mx = (mouse.x - CX) / U, my = (mouse.y - CY) / U;
    for (let i = 0; i < P.NR; i++) {
      const f = smoothstep(P.delay[i], P.delay[i] + 0.5, F), a = P.UF[i], b = P.F0[i];
      const x = lerp(a[0], b[0] * 1.15, f), y = lerp(a[1], b[1] * 1.15, f), z = lerp(a[2], b[2] * 1.15, f);
      const x1 = x * cr + z * sr, z0 = -x * sr + z * cr;
      const y1 = y * ct - z0 * st, z1 = y * st + z0 * ct;
      const persp = 1 + z1 * 0.22, d = P.disp[i];
      const px = x1 * persp + d[0], py = y1 * persp + d[1];
      // the cursor pushes residues aside; they relax back into the fold
      const ddx = px - mx, ddy = py - my, dist = Math.hypot(ddx, ddy);
      if (dist < 0.22 && dist > 1e-4) { const push = (1 - dist / 0.22) * 0.03; d[0] += (ddx / dist) * push; d[1] += (ddy / dist) * push; }
      d[0] *= 0.965; d[1] *= 0.965;
      const R = P.res[i]; R.x = px; R.y = py; R.z = z1;
    }
  }

  /* ---------- anatomical heart (anterior view), sampled from shapes ---------- */
  const HEART = (() => {
    const c = document.createElement("canvas").getContext("2d");
    c.lineCap = "round"; c.lineJoin = "round";
    const path = (f) => { const p = new Path2D(); f(p); return p; };
    const ell = (x, y, rx, ry, rot) => path((p) => p.ellipse(x, y, rx, ry, rot, 0, TAU));
    const line = (pts) => path((p) => pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))));
    // front-most first (raw units ≈ ±100)
    const shapes = [
      { p: path((p) => { p.moveTo(6, -28); p.bezierCurveTo(8, -48, 16, -62, 28, -66); }), w: 20, tag: "pa" }, // pulmonary trunk
      { p: line([[24, -66], [66, -60]]), w: 13, tag: "pa" }, // left pulmonary artery
      { p: ell(-36, -34, 14, 8, -0.5), tag: "atrium" }, // right auricle
      { p: path((p) => { p.moveTo(-50, -12); p.bezierCurveTo(-28, -34, 22, -38, 50, -22); p.bezierCurveTo(74, -4, 76, 42, 40, 82); p.bezierCurveTo(30, 92, 18, 96, 10, 90); p.bezierCurveTo(-20, 70, -48, 40, -58, 14); p.bezierCurveTo(-62, 2, -58, -6, -50, -12); p.closePath(); }), tag: "ventricle" },
      { p: ell(54, -30, 14, 7, 0.4), tag: "atrium" }, // left auricle
      { p: ell(-56, -8, 21, 30, -0.2), tag: "atrium" }, // right atrium
      { p: path((p) => { p.moveTo(-16, -26); p.bezierCurveTo(-24, -60, -20, -88, 4, -96); p.bezierCurveTo(26, -102, 44, -88, 42, -62); p.lineTo(40, -40); }), w: 20, tag: "aorta" },
      { p: path((p) => { p.moveTo(-8, -95); p.lineTo(-14, -126); p.moveTo(8, -99); p.lineTo(8, -128); p.moveTo(24, -97); p.lineTo(32, -124); }), w: 8, tag: "aorta" },
      { p: line([[-58, -30], [-57, -100]]), w: 17, tag: "vein" }, // superior vena cava
      { p: line([[-56, 16], [-54, 42]]), w: 15, tag: "vein" }, // inferior vena cava
    ];
    const inside = (s, x, y) => { if (s.w) { c.lineWidth = s.w; return c.isPointInStroke(s.p, x, y); } return c.isPointInPath(s.p, x, y); };
    const onEdge = (s, x, y) => {
      if (s.w) { c.lineWidth = s.w + 2.6; if (!c.isPointInStroke(s.p, x, y)) return false; c.lineWidth = s.w - 2.6; return !c.isPointInStroke(s.p, x, y); }
      c.lineWidth = 2.6; return c.isPointInStroke(s.p, x, y);
    };
    const toU = (x, y) => [(x / 100) * 0.82, (y / 100) * 0.82 + 0.1];
    const r = rng(13), fill = [], edge = [];
    for (let guard = 0; (fill.length < 1500 || edge.length < 1100) && guard < 400000; guard++) {
      const x = -82 + r() * 168, y = -134 + r() * 236;
      const front = shapes.findIndex((s) => inside(s, x, y));
      if (fill.length < 1500 && front >= 0) fill.push([...toU(x, y), shapes[front].tag]);
      if (edge.length < 1100) {
        for (let k = 0; k < shapes.length; k++) {
          if (onEdge(shapes[k], x, y)) { if (front < 0 || front >= k) edge.push([...toU(x, y), shapes[k].tag]); break; }
        }
      }
    }
    return { fill, edge, toU };
  })();
  const HCOL = {
    ventricle: [COL.coral, COL.rose], atrium: [[255, 140, 165], [255, 175, 195]], aorta: [[255, 90, 110], [255, 120, 130]],
    pa: [[125, 145, 255], [140, 160, 255]], vein: [[90, 125, 255], [110, 140, 255]],
  };

  /* ---------- ASLingo board (same layout as the game: 8×8 cells of 60px) ---------- */
  const BOARD = (() => {
    const load = (f) => { const im = new Image(); im.src = "assets/aslingo/" + f; return im; };
    const ZONES = [
      { img: load("fruit.jpg"), x: 80, y: 2, w: 150, h: 50, cell: [2, 1], items: ["🍎 Apple", "🍊 Orange", "🍓 Strawberry"] },
      { img: load("veg.png"), x: 2, y: 160, w: 50, h: 150, cell: [1, 3], items: ["🥕 Carrot", "🥦 Broccoli", "🥬 Lettuce"] },
      { img: load("dessert.png"), x: 300, y: 2, w: 150, h: 50, cell: [6, 1], items: ["🍰 Cake", "🍪 Cookie"] },
      { img: load("cashier.png"), x: 328, y: 250, w: 150, h: 50, cell: [6, 5], items: [] },
    ];
    const free = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const x = 30 + c * 60, y = 30 + r * 60;
      free[r * 8 + c] = !ZONES.some((z) => x + 18 > z.x && x - 18 < z.x + z.w && y + 18 > z.y && y - 18 < z.y + z.h);
    }
    return { ZONES, hog: load("hedgehog.png"), free };
  })();
  const hog = { x: 3, y: 4, path: [], wait: 0.6, face: 1, phase: 0, bubble: "", bubbleT: 0, cur: null };
  const hr = rng(77);
  let queue = [], shopping = [];
  const randomFree = () => { let c; do { c = [(hr() * 8) | 0, (hr() * 8) | 0]; } while (!BOARD.free[c[1] * 8 + c[0]]); return c; };
  function newRound() {
    shopping = BOARD.ZONES.slice(0, 3).map((z) => ({ z, item: z.items[(hr() * z.items.length) | 0], done: false }));
    queue = [];
    for (const s of shopping) queue.push({ cell: randomFree() }, { cell: s.z.cell, item: s });
    queue.push({ cell: randomFree() }, { cell: BOARD.ZONES[3].cell, checkout: true });
  }
  function bfs(a, b) {
    const key = (c, r) => r * 8 + c, start = key(a[0], a[1]), goal = key(b[0], b[1]), prev = new Map([[start, -1]]), q = [start];
    while (q.length) {
      const k = q.shift(); if (k === goal) break;
      const c = k % 8, r = (k / 8) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, nk = key(nc, nr);
        if (nc < 0 || nr < 0 || nc > 7 || nr > 7 || !BOARD.free[nk] || prev.has(nk)) continue;
        prev.set(nk, k); q.push(nk);
      }
    }
    const out = [];
    if (!prev.has(goal)) return out;
    for (let k = goal; k !== start; k = prev.get(k)) out.unshift([k % 8, (k / 8) | 0]);
    return out;
  }
  function arrive(tgt) {
    if (tgt.item) { tgt.item.done = true; hog.bubble = `${tgt.item.item} ✓`; hog.bubbleT = 1.6; hog.wait = 1.3; }
    else if (tgt.checkout) { hog.bubble = "Checkout ✓"; hog.bubbleT = 1.8; hog.wait = 1.8; }
    else hog.wait = 0.1;
  }
  function updateHog(dt) {
    if (hog.bubbleT > 0) hog.bubbleT -= dt;
    if (hog.wait > 0) { hog.wait -= dt; return; }
    if (!hog.path.length) {
      if (!queue.length) newRound();
      hog.cur = queue.shift();
      hog.path = bfs([Math.round(hog.x), Math.round(hog.y)], hog.cur.cell);
      if (!hog.path.length) arrive(hog.cur);
      return;
    }
    const [c, r] = hog.path[0], dx = c - hog.x, dy = r - hog.y, d = Math.hypot(dx, dy), sp = 2.6 * dt;
    if (Math.abs(dx) > 0.01) hog.face = Math.sign(dx);
    hog.phase += dt * 14;
    if (d <= sp) { hog.x = c; hog.y = r; hog.path.shift(); if (!hog.path.length) arrive(hog.cur); }
    else { hog.x += (dx / d) * sp; hog.y += (dy / d) * sp; }
  }
  newRound();

  /* ---------- formations: write target into out = {x,y,r,g,b,a,s} ---------- */
  function patient(p, i, t, o) {
    if (p.h3 < 0.16) { // plasma flowing through the vessels
      const f = reduceMotion ? p.h1 : (p.h1 + t * 0.1) % 1;
      const branch = (p.h2 * 3) | 0;
      if (branch === 0) { o.x = 0.02 * Math.sin(f * 18); o.y = -0.6 + f * 1.45; }
      else { const s = branch === 1 ? -1 : 1; o.x = s * (0.26 + 0.14 * f) + 0.01 * Math.sin(f * 20); o.y = -0.55 + f * 0.8; }
      const c = COL.mint; o.r = c[0]; o.g = c[1]; o.b = c[2]; o.a = 0.95; o.s = 1.6;
    } else if (p.h3 < 0.24) { // liver
      o.x = -0.1 + p.g1 * 0.06; o.y = -0.18 + p.g2 * 0.035;
      const c = COL.amber; o.r = c[0]; o.g = c[1]; o.b = c[2]; o.a = 0.9; o.s = 1.6;
    } else {
      const b = body[i % body.length];
      o.x = b[0]; o.y = b[1];
      const c = COL.ivory; o.r = c[0]; o.g = c[1]; o.b = c[2]; o.a = 0.45; o.s = 1.3;
    }
  }

  function protein(p, i, t, o) {
    const P = PROT, ri = i % P.NR, a = P.res[ri];
    let x, y, z;
    if (p.h3 < 0.4 && ri < P.NR - 1) { const b = P.res[ri + 1]; x = lerp(a.x, b.x, p.h1); y = lerp(a.y, b.y, p.h1); z = lerp(a.z, b.z, p.h1); }
    else { x = a.x + p.g1 * 0.016; y = a.y + p.g2 * 0.016; z = a.z; }
    o.x = x; o.y = y;
    const c = SSCOL[P.ss[ri]], dn = clamp((z + 0.7) / 1.4);
    o.r = c[0]; o.g = c[1]; o.b = c[2]; o.a = 0.3 + 0.6 * dn; o.s = 1.1 + dn * 1.3;
  }

  let beat = 0;
  const BEAT_PERIOD = 1.6; // slow, calm rhythm
  function heart(p, i, t, o) {
    const isEdge = p.h3 < 0.58;
    const q = isEdge ? HEART.edge[i % HEART.edge.length] : HEART.fill[i % HEART.fill.length];
    const chamber = q[2] === "ventricle" || q[2] === "atrium";
    const k = 1 + beat * (chamber ? 0.055 : 0.02), bx = 0.066, by = 0.346;
    o.x = bx + (q[0] - bx) * k; o.y = by + (q[1] - by) * k;
    const c = HCOL[q[2]][isEdge ? 0 : 1];
    o.r = c[0]; o.g = c[1]; o.b = c[2]; o.a = isEdge ? 0.9 : 0.3; o.s = isEdge ? 1.6 : 1.25;
  }

  function board(p, i, t, o) { // particles trace a glowing frame around the game board
    const hb = 0.9 + p.g1 * 0.012, u = reduceMotion ? p.h1 : (p.h1 + t * 0.015) % 1;
    const side = (u * 4) | 0, f = u * 4 - side;
    const pt = [[-hb + 2 * hb * f, -hb], [hb, -hb + 2 * hb * f], [hb - 2 * hb * f, hb], [-hb, hb - 2 * hb * f]][side];
    o.x = pt[0]; o.y = pt[1];
    const c = p.h3 < 0.75 ? [253, 193, 214] : [69, 150, 174];
    o.r = c[0]; o.g = c[1]; o.b = c[2]; o.a = 0.55; o.s = 1.3;
  }

  const FORMS = [patient, protein, heart, board];

  /* ---------- overlays drawn under the particles ---------- */
  function label(ctx, text, x, y, a, align = "left", color = "rgba(226,237,255,") {
    ctx.font = "500 9px DM Mono, monospace"; ctx.textAlign = align;
    ctx.fillStyle = color + a + ")"; ctx.fillText(text, x, y); ctx.textAlign = "left";
  }
  const P = (x, y) => [CX + x * U, CY + y * U];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const OVERLAYS = [
    (ctx, w, t) => { // patient: orbit of modalities around the body
      ctx.save(); ctx.translate(CX, CY); ctx.rotate(reduceMotion ? 0 : t * 0.05);
      ctx.strokeStyle = `rgba(58,108,255,${0.45 * w})`; ctx.setLineDash([3, 7]); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(0, 0, U * 0.95, U * 1.08, 0, 0, TAU); ctx.stroke(); ctx.restore();
      ctx.setLineDash([]);
      ["GENOTYPE", "LIVER CELL EXPRESSION", "PLASMA PROTEINS", "BIOMARKERS"].forEach((txt, k) => {
        const a = (reduceMotion ? 0 : t * 0.05) + (k * Math.PI) / 2 + 0.6;
        const x = CX + Math.cos(a) * U * 0.95, y = CY + Math.sin(a) * U * 1.08;
        ctx.fillStyle = `rgba(58,108,255,${0.9 * w})`; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
        if (!isMobile()) label(ctx, txt, x + (Math.cos(a) > 0 ? 10 : -10), y + 3, 0.85 * w, Math.cos(a) > 0 ? "left" : "right");
      });
      const [lx, ly] = P(-0.1, -0.18);
      ctx.strokeStyle = `rgba(255,181,71,${0.6 * w})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx - 10, ly); ctx.lineTo(lx - U * 0.45, ly - 10); ctx.stroke();
      label(ctx, "LIVER", lx - U * 0.45 - 6, ly - 7, 0.9 * w, "right", "rgba(255,181,71,");
      if (!isMobile()) label(ctx, "17 CELL-TYPE MODELS → PLASMA REGULATION", CX, CY + U * 1.32, 0.6 * w, "center");
    },
    (ctx, w) => { // protein backbone + folding readout
      const Pr = PROT, R = Pr.res;
      ctx.lineCap = "round";
      for (let i = 0; i < Pr.NR - 1; i++) {
        const a = R[i], b = R[i + 1], dn = clamp(((a.z + b.z) / 2 + 0.7) / 1.4);
        ctx.strokeStyle = rgba(SSCOL[Pr.ss[i]], (0.2 + 0.45 * dn) * w);
        ctx.lineWidth = 1.2 + dn * 2.2;
        ctx.beginPath(); ctx.moveTo(CX + a.x * U, CY + a.y * U); ctx.lineTo(CX + b.x * U, CY + b.y * U); ctx.stroke();
      }
      ctx.lineCap = "butt";
      const F = Pr.F, tag = (ri, txt, col, dx) => {
        const [x, y] = P(R[ri].x, R[ri].y);
        ctx.strokeStyle = `${col}${0.6 * w})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y - 26); ctx.stroke();
        label(ctx, txt, x + dx + (dx > 0 ? 4 : -4), y - 29, 0.9 * w, dx > 0 ? "left" : "right", col);
      };
      if (F > 0.85) { const k = smoothstep(0.85, 1, F); tag(5, "α-HELIX", "rgba(164,147,255,", -40 * k); tag(74, "β-SHEET", "rgba(255,181,71,", 40 * k); }
      else if (F < 0.12) tag(10, "UNFOLDED POLYPEPTIDE", "rgba(95,212,230,", -30);
      const bw = U * 1.2, bx = CX - bw / 2, by = CY + U * 1.12;
      ctx.fillStyle = `rgba(226,237,255,${0.15 * w})`; ctx.fillRect(bx, by, bw, 2);
      ctx.fillStyle = `rgba(164,147,255,${0.9 * w})`; ctx.fillRect(bx, by, bw * F, 2);
      label(ctx, `FOLDING · ${Math.round(F * 100)}%`, bx, by - 9, 0.75 * w);
      if (!isMobile()) label(ctx, "MOVE YOUR CURSOR THROUGH THE CHAIN", bx + bw, by - 9, 0.5 * w, "right");
      if (!isMobile()) label(ctx, "SPLICED TRANSCRIPT → PROTEIN ISOFORM", CX, CY + U * 1.32, 0.6 * w, "center");
    },
    (ctx, w, t) => { // heart: coronary arteries, anatomy labels, slow ECG
      const T = (x, y) => { const [u, v] = HEART.toU(x, y); return [CX + u * U, CY + v * U]; };
      ctx.strokeStyle = `rgba(255,181,71,${0.5 * w})`; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(...T(6, -24)); ctx.bezierCurveTo(...T(22, 10), ...T(28, 52), ...T(18, 90)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...T(16, -4)); ctx.quadraticCurveTo(...T(40, 8), ...T(54, 34)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...T(-22, -22)); ctx.bezierCurveTo(...T(-40, -10), ...T(-50, 30), ...T(-26, 64)); ctx.stroke();
      if (!isMobile()) {
        const call = (x, y, dx, txt) => {
          const [px, py] = T(x, y);
          ctx.strokeStyle = `rgba(226,237,255,${0.35 * w})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx, py); ctx.stroke();
          label(ctx, txt, px + dx + (dx > 0 ? 6 : -6), py + 3, 0.65 * w, dx > 0 ? "left" : "right");
        };
        call(36, -100, 46, "AORTA");
        call(68, -60, 34, "PULMONARY ARTERY");
        call(-60, -88, -40, "SUPERIOR VENA CAVA");
        call(-76, -4, -34, "RIGHT ATRIUM");
        call(66, 30, 34, "LEFT VENTRICLE");
        call(-30, 50, -84, "RIGHT VENTRICLE");
      }
      const x0 = CX - U * 1.05, x1 = CX + U * 1.05, yb = CY + U * 1.1;
      const ecg = (s) => { s = ((s % 1) + 1) % 1; const G = (m, sd) => Math.exp(-((s - m) ** 2) / (2 * sd * sd)); return 0.1 * G(0.12, 0.025) - 0.1 * G(0.2, 0.008) + G(0.23, 0.01) - 0.22 * G(0.26, 0.01) + 0.22 * G(0.45, 0.04); };
      const head = (t / BEAT_PERIOD) % 1;
      ctx.lineWidth = 1.4; ctx.beginPath();
      for (let px = x0; px <= x1; px += 2) {
        const u = (px - x0) / (x1 - x0), y = yb - ecg(u * 2 + 0.5 - head) * U * 0.2;
        px === x0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.strokeStyle = `rgba(255,122,144,${0.75 * w})`; ctx.stroke();
      if (!isMobile()) label(ctx, "BubR1 ↓ · HYPERTROPHY · FIBROSIS · SENESCENCE", CX, CY + U * 1.32, 0.6 * w, "center");
    },
    (ctx, w) => { // ASLingo board, autoplaying
      const B = U * 1.6, s = B / 480, x0 = CX - B / 2, y0 = CY - B / 2, pad = 12 * s;
      ctx.save(); ctx.globalAlpha = w;
      ctx.shadowColor = "rgba(253,193,214,0.3)"; ctx.shadowBlur = 50;
      ctx.fillStyle = "#1b1b2b"; ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x0 - pad, y0 - pad, B + pad * 2, B + pad * 2, 8) : ctx.rect(x0 - pad, y0 - pad, B + pad * 2, B + pad * 2);
      ctx.fill(); ctx.shadowBlur = 0;
      const cs = 60 * s;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { ctx.fillStyle = (r + c) % 2 === 0 ? "#fdc1d6" : "#ffffff"; ctx.fillRect(x0 + c * cs, y0 + r * cs, cs + 0.5, cs + 0.5); }
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k <= 8; k++) { ctx.moveTo(x0 + k * cs, y0); ctx.lineTo(x0 + k * cs, y0 + B); ctx.moveTo(x0, y0 + k * cs); ctx.lineTo(x0 + B, y0 + k * cs); }
      ctx.stroke();
      for (const z of BOARD.ZONES) { // like CSS background-size: cover
        const im = z.img; if (!im.complete || !im.naturalWidth) continue;
        const ar = z.w / z.h, iar = im.naturalWidth / im.naturalHeight;
        let sw = im.naturalWidth, sh = im.naturalHeight, sx = 0, sy = 0;
        if (iar > ar) { sw = sh * ar; sx = (im.naturalWidth - sw) / 2; } else { sh = sw / ar; sy = (im.naturalHeight - sh) / 2; }
        ctx.drawImage(im, sx, sy, sw, sh, x0 + z.x * s, y0 + z.y * s, z.w * s, z.h * s);
      }
      const moving = hog.path.length > 0 && hog.wait <= 0;
      const hx = x0 + (30 + hog.x * 60) * s, hy = y0 + (30 + hog.y * 60) * s - (moving && !reduceMotion ? Math.abs(Math.sin(hog.phase)) * 2.5 * s : 0);
      if (BOARD.hog.complete && BOARD.hog.naturalWidth) {
        const hw = 40 * s, hh = hw * (BOARD.hog.naturalHeight / BOARD.hog.naturalWidth);
        ctx.save(); ctx.translate(hx, hy); ctx.scale(hog.face < 0 ? -1 : 1, 1); ctx.drawImage(BOARD.hog, -hw / 2, -hh / 2, hw, hh); ctx.restore();
      }
      if (hog.bubbleT > 0) { // speech bubble when an item is signed
        ctx.globalAlpha = w * clamp(hog.bubbleT * 3);
        ctx.font = `600 ${Math.max(11, 13 * s * 1.6)}px "Space Grotesk", sans-serif`;
        const tw = ctx.measureText(hog.bubble).width + 18, bh = 24, bx = clamp(hx - tw / 2, x0, x0 + B - tw), by = hy - 22 * s - bh - 6;
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#4596ae"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw, bh, 12) : ctx.rect(bx, by, tw, bh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1b1b2b"; ctx.fillText(hog.bubble, bx + 9, by + 16.5);
      }
      ctx.restore();
      // shopping list beside the board, when there's room
      const lx = CX + U * 0.9 + 26;
      if (!isMobile() && lx + 150 < W - 70) {
        label(ctx, "SHOPPING LIST", lx, y0 + 8, 0.7 * w, "left", "rgba(253,193,214,");
        ctx.font = '500 13px "Space Grotesk", sans-serif';
        shopping.forEach((it, k) => {
          ctx.fillStyle = `rgba(226,237,255,${(it.done ? 0.45 : 0.9) * w})`;
          ctx.fillText(`${it.done ? "✓" : "○"}  ${it.item}`, lx, y0 + 34 + k * 24);
        });
      }
      if (!isMobile()) label(ctx, "ASLINGO · GROCERY-STORE GAME · AUTOPLAY", CX, CY + U * 0.9 + 26, 0.6 * w, "center");
    },
  ];

  /* ---------- setup ---------- */
  function layout() {
    g = fitCanvas(canvas, isMobile() ? 1.25 : 1.5);
    W = g.w; H = g.h;
    if (isMobile()) { U = Math.min(W * 0.33, H * 0.18); CX = W * 0.5; CY = H * 0.36; }
    else { U = Math.min(W * 0.22, H * 0.34); CX = W * 0.65; CY = H * 0.52; }
    const n = isMobile() ? 560 : 950;
    if (n !== N) {
      N = n;
      parts = Array.from({ length: N }, (_, i) => {
        const r = rng(1000 + i);
        return { x: CX + (r() - 0.5) * W, y: CY + (r() - 0.5) * H, vx: 0, vy: 0, h1: r(), h2: r(), h3: r(), g1: gauss(r), g2: gauss(r), sw: r() * TAU };
      });
    }
  }

  // scroll → (k, m): blending formation k into k+1 by m
  let progress = 0;
  function readScroll() {
    const r = section.getBoundingClientRect();
    progress = clamp(-r.top / (r.height - innerHeight));
  }
  function stepInfo() {
    const q = clamp((progress - 0.03) / 0.94) * LAST_STEP;
    const k = Math.min(LAST_STEP - 1, Math.floor(q));
    const m = smoothstep(0.45, 1, q - k);
    return { k, m, active: m < 0.5 ? k : k + 1 };
  }

  let shownStep = -1;
  function updateHud(step) {
    if (step === shownStep) return;
    shownStep = step;
    const s = STATES[step];
    hud.modality.textContent = s.modality; hud.value.textContent = s.value;
    hud.name.textContent = s.name; hud.context.textContent = s.context;
    chapters.forEach((c, i) => c.classList.toggle("active", i === step));
    railDots.forEach((d, i) => d.classList.toggle("active", i <= step));
  }

  const A = {}, B = {};
  let lastT = 0;
  function frame(t) {
    const dt = lastT ? Math.min(0.05, t - lastT) : 0; lastT = t;
    readScroll();
    const { k, m, active } = stepInfo();
    updateHud(active);
    railProgress.style.transform = `scaleY(${progress})`;
    const ph = (t % BEAT_PERIOD) / BEAT_PERIOD;
    beat = Math.exp(-((ph - 0.08) ** 2) / 0.0025) + 0.5 * Math.exp(-((ph - 0.3) ** 2) / 0.004);
    if (k === 1 || k + 1 === 1) computeProtein(t);
    if (k === 2 && m > 0.01 && !reduceMotion) updateHog(dt);

    const ctx = g.ctx;
    ctx.clearRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(CX, CY, 0, CX, CY, U * 1.6);
    glow.addColorStop(0, "rgba(58,108,255,0.12)"); glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    const wA = 1 - m, wB = m;
    if (wA > 0.02) OVERLAYS[k](ctx, wA * wA, t);
    if (wB > 0.02) OVERLAYS[k + 1](ctx, wB * wB, t);

    ctx.globalCompositeOperation = "lighter";
    const fa = FORMS[k], fb = FORMS[k + 1];
    const swirl = Math.sin(m * Math.PI) * 0.22;
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      fa(p, i, t, A); fb(p, i, t, B);
      let tx = lerp(A.x, B.x, m), ty = lerp(A.y, B.y, m);
      tx += Math.cos(p.sw) * swirl * p.h2; ty += Math.sin(p.sw) * swirl * p.h2;
      tx = CX + tx * U; ty = CY + ty * U;
      if (reduceMotion) { p.x = tx; p.y = ty; }
      else {
        p.vx += (tx - p.x) * 0.08; p.vy += (ty - p.y) * 0.08;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 8100) { const d = Math.sqrt(d2) || 1, f = (1 - d / 90) * 3.2; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
        p.vx *= 0.76; p.vy *= 0.76; p.x += p.vx; p.y += p.vy;
      }
      const a = lerp(A.a, B.a, m), s = lerp(A.s, B.s, m);
      ctx.fillStyle = `rgba(${lerp(A.r, B.r, m) | 0},${lerp(A.g, B.g, m) | 0},${lerp(A.b, B.b, m) | 0},${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- interaction ---------- */
  canvas.parentElement.addEventListener("pointermove", (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.parentElement.addEventListener("pointerleave", () => { mouse.x = mouse.y = -1e4; });
  railDots.forEach((d, s) => d.addEventListener("click", () => goToStep(s)));

  layout();
  onResize(layout);
  readScroll(); updateHud(stepInfo().active);
  runWhileVisible(canvas, frame);
})();

/* =========================================================
   3. PAGE CHROME
   ========================================================= */
(function chrome() {
  const bar = document.getElementById("page-progress");
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  document.querySelectorAll("[data-goto-step]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); goToStep(+a.dataset.gotoStep); }));

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  document.getElementById("year").textContent = new Date().getFullYear();
})();
