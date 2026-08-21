/* ════════════════════════════════════════════════════
   NishKiNishaani  ·  Card Deck Engine  ·  7 cards
   Scrub-driven motion: scroll/touch links to progress.
   ════════════════════════════════════════════════════ */

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycby9FFiDErVagAjtDLixDCIEULznLpxtDRz0qdob9uQzzYvVqaOLiVD-FlvAn3IrvRmy/exec';

/* ── Monogram: strip black bg once, apply to every instance ── */
(function stripMonogramBlack() {
  const imgs = Array.from(document.querySelectorAll('.ci-monogram, .cmsg-monogram'));
  if (!imgs.length) return;

  const src = imgs[0].getAttribute('src') || imgs[0].src;
  const loader = new Image();
  loader.onload = function () {
    try {
      const W = loader.naturalWidth;
      const H = loader.naturalHeight;
      if (!W || !H) return;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(loader, 0, 0);

      const id = ctx.getImageData(0, 0, W, H);
      const px = id.data;
      const LOW = 55;
      const HIGH = 110;

      for (let i = 0; i < px.length; i += 4) {
        const lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        if (lum <= LOW) px[i + 3] = 0;
        else if (lum < HIGH) px[i + 3] = Math.round((lum - LOW) / (HIGH - LOW) * 255);
      }

      ctx.putImageData(id, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      imgs.forEach(img => { img.src = dataUrl; });
    } catch (e) { /* ignore */ }
  };
  loader.src = src;
})();

const EVENT = new Date('2026-10-20T18:30:00+05:30'); /* 20 Oct 2026, 6:30 PM IST */
const TOTAL = 7;
const cards = Array.from(document.querySelectorAll('.card'));
let order = cards.map((_, i) => i);

/* ════════════════════════════════════════════════════
   SCRUB MOTION ENGINE
   One gesture = one mode (advance OR retreat). Opposite
   scroll only reduces progress; cancel snaps instantly.
   Scatter only on leaving card 1. All retreats roll in.
   ════════════════════════════════════════════════════ */
const COMMIT      = 0.28;
const WHEEL_SCALE = 1 / 420;
const SETTLE_MS   = 180;
/* Pause between wheel events that means “new scroll”, not leftover flick */
const NEW_GESTURE_MS = 160;

let mode        = 'idle'; /* idle | advance | retreat */
let progress    = 0;
let velocity    = 0;
let lastT       = 0;
let settling    = false;
let settleTimer = null;
let animFrame   = null;
let dissolve    = null;
let revealTarget = null;
let pageLocked  = false; /* this scroll stream already turned a page */
let lockDir     = 0;     /* +1 advance lock, -1 retreat lock */
let lastInputAt = 0;     /* for detecting a fresh scroll vs same flick */
let touchX0     = null;

function lockAfterPage(dir) {
  pageLocked = true;
  lockDir = dir;
  /* Restart gesture clock so settle-time gaps don't look like a new scroll */
  lastInputAt = performance.now();
}

function releasePageLock() {
  pageLocked = false;
  lockDir = 0;
}

function pad(n) { return String(n).padStart(2, '0'); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function frontCard() { return cards[order[0]]; }
function prevCard()  { return cards[order[order.length - 1]]; }
function nextCard()  { return cards[order[1]]; }
function canRetreat() { return order[0] > 0; }
function canAdvance() { return order[0] < TOTAL - 1; }

function applyPositions() {
  order.forEach((cardIdx, pos) => { cards[cardIdx].dataset.pos = String(pos); });
}

function resetReveals(cardEl) {
  cardEl.querySelectorAll('[data-r].revealed').forEach(el => el.classList.remove('revealed'));
}

function triggerReveals(cardEl) {
  cardEl.querySelectorAll('[data-r]').forEach(el => {
    const delay = parseInt(el.dataset.d, 10) || 0;
    setTimeout(() => el.classList.add('revealed'), delay);
  });
}

function scrubReveals(cardEl, p) {
  if (!cardEl) return;
  cardEl.querySelectorAll('[data-r]').forEach(el => {
    const delay = parseInt(el.dataset.d, 10) || 0;
    const threshold = 0.12 + Math.min(1, delay / 1200) * 0.65;
    if (p >= threshold) el.classList.add('revealed');
    else el.classList.remove('revealed');
  });
}

function markAllRevealed(cardEl) {
  cardEl.querySelectorAll('[data-r]').forEach(el => el.classList.add('revealed'));
}

/* Strip every scrub-related inline style so nothing can stick mid-way */
function hardResetChrome() {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  clearTimeout(settleTimer);
  settleTimer = null;

  if (dissolve) {
    dissolve.tiles.forEach(({ el }) => el.parentNode && el.parentNode.removeChild(el));
    dissolve = null;
  }
  document.querySelectorAll('.scrub-tile').forEach(el => el.remove());

  cards.forEach(card => {
    card.classList.remove('is-scrubbing', 'no-transition');
    card.style.transform = '';
    card.style.transformOrigin = '';
    card.style.removeProperty('border-radius');
    card.style.opacity = '';
    card.style.zIndex = '';
    card.style.pointerEvents = '';
    card.style.visibility = '';
  });

  revealTarget = null;
  applyPositions();
}

/* ── Rasterize (advance from card 1 only) ─────────── */
function rasterizeCard(card) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(1, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width  = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const theme = card.dataset.theme;
  if (theme === 'invite') {
    ctx.fillStyle = '#f4e8d4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(155,110,50,0.09)';
    for (let y = 0; y < H; y += 22)
      for (let x = 0; x < W; x += 22) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (theme === 'names') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5c1a2e');
    g.addColorStop(0.45, '#4a1526');
    g.addColorStop(1, '#3d1220');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = getComputedStyle(card).backgroundColor || '#1a0c10';
    ctx.fillRect(0, 0, W, H);
  }

  card.querySelectorAll('img').forEach(img => {
    if (!img.naturalWidth) return;
    const r = img.getBoundingClientRect();
    try { ctx.drawImage(img, r.left, r.top, r.width, r.height); }
    catch (e) { /* tainted */ }
  });

  const textSel = 'p, .ci-hero, .ci-tag, .cn-name__txt, .cn-surname, .cn-and, .cn-post__txt, .cs-label, .cs-day, .cs-month, .cs-year, .cc-num, .cc-uname, .ce-time, .ce-name, .cv-name, .cv-place, .cm-title';
  card.querySelectorAll(textSel).forEach(el => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const text = (el.textContent || '').trim();
    if (!text) return;
    ctx.save();
    ctx.font = style.font;
    let color = style.color;
    if (el.classList.contains('cn-name__txt') || style.webkitTextFillColor === 'rgba(0, 0, 0, 0)') {
      color = '#e8d090';
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r.left + r.width / 2, r.top + r.height / 2);
    ctx.restore();
  });

  return { canvas, W, H };
}

function ensureDissolve(sourceCard) {
  if (dissolve) return;
  const departing = sourceCard || frontCard();
  /* Rasterize WHILE still visible, then cover with tiles, then hide */
  const { canvas, W, H } = rasterizeCard(departing);
  const url = canvas.toDataURL('image/jpeg', 0.72);
  const TILE = 80;
  const cols = Math.ceil(W / TILE) + 1;
  const rows = Math.ceil(H / TILE) + 1;
  const cx = W / 2;
  const cy = H / 2;
  const tiles = [];
  const frag = document.createDocumentFragment();
  const diamond = 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)';

  function addTile(tx, ty) {
    const el = document.createElement('div');
    const midX = tx + TILE / 2;
    const midY = ty + TILE / 2;
    const dx = midX - cx;
    const dy = midY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 100 + Math.random() * 160;
    el.className = 'scrub-tile scrub-tile--diamond';
    el.style.cssText =
      `position:fixed;left:${tx}px;top:${ty}px;` +
      `width:${TILE}px;height:${TILE}px;` +
      `background-image:url(${url});` +
      `background-size:${W}px ${H}px;` +
      `background-position:-${tx}px -${ty}px;` +
      `clip-path:${diamond};` +
      `-webkit-clip-path:${diamond};` +
      `z-index:1000;pointer-events:none;` +
      `will-change:transform,opacity;` +
      `transform:translate(0px,0px) rotate(0deg) scale(1);opacity:1;`;
    frag.appendChild(el);
    tiles.push({
      el,
      bx: (dx / dist) * speed,
      by: (dy / dist) * speed,
      br: (Math.random() - 0.5) * 140,
    });
  }

  /* Dual grid: base diamonds + offset diamonds → full cover, no square look */
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addTile(c * TILE, r * TILE);
      addTile(c * TILE + TILE / 2, r * TILE + TILE / 2);
    }
  }
  document.body.appendChild(frag);

  departing.classList.add('is-scrubbing');
  departing.style.visibility = 'hidden';
  departing.style.pointerEvents = 'none';

  dissolve = { tiles, departing };
}

function applyDissolveProgress(p) {
  if (!dissolve) return;
  dissolve.tiles.forEach(({ el, bx, by, br }) => {
    el.style.transform =
      `translate(${bx * p}px,${by * p}px) rotate(${br * p}deg) scale(${1 - 0.96 * p})`;
    el.style.opacity = String(1 - p);
  });
}

function armPrevCard(prev) {
  prev.classList.add('is-scrubbing');
  prev.style.visibility = 'visible';
  prev.style.opacity = '1';
  prev.style.pointerEvents = 'none';
  prev.style.zIndex = '12';
}

/* Ease-out scale: shrink reads early, then softens */
function rollScale(p) {
  const t = 1 - Math.pow(1 - p, 1.55);
  return 1 - t * 0.30; /* → ~0.70 at full roll */
}

const ROLL_RADIUS = 42; /* constant for the whole roll — not ramped from 0 */

function applyRollRadius(el) {
  /* Must beat .card[data-pos] { border-radius: 0 !important } on buried cards */
  el.style.setProperty('border-radius', `${ROLL_RADIUS}px`, 'important');
}

function applyScrubVisual() {
  const p = progress;

  if (mode === 'advance') {
    if (!revealTarget && order[1] !== undefined) {
      revealTarget = nextCard();
      resetReveals(revealTarget);
    }
    scrubReveals(revealTarget, p);

    if (order[0] === 0) {
      if (!dissolve) ensureDissolve(frontCard());
      applyDissolveProgress(p);
      return;
    }
    const f = frontCard();
    const s = rollScale(p);
    f.classList.add('is-scrubbing');
    f.style.zIndex = '11';
    f.style.transformOrigin = 'center center';
    f.style.transform =
      `translateX(${p * 105}%) rotate(${p * 14}deg) scale(${s})`;
    applyRollRadius(f);
    return;
  }

  if (mode === 'retreat') {
    /* Previous page rolls IN from the left (same scale + roundness as exit) */
    const prev = prevCard();
    armPrevCard(prev);
    const t = 1 - p; /* 1 = off-screen left, 0 = settled */
    const s = rollScale(t);
    prev.style.transformOrigin = 'center center';
    prev.style.transform =
      `translateX(${-105 * t}%) rotate(${-14 * t}deg) scale(${s})`;
    applyRollRadius(prev);

    if (!revealTarget) {
      revealTarget = prev;
      resetReveals(revealTarget);
    }
    scrubReveals(revealTarget, p);
  }
}

function setProgress(p) {
  progress = clamp01(p);
  applyScrubVisual();
}

function goIdle() {
  mode = 'idle';
  progress = 0;
  velocity = 0;
  settling = false;
}

function finishAdvanceCommit() {
  const departed = order[0] === 0 && dissolve ? dissolve.departing : frontCard();
  hardResetChrome();
  order.push(order.shift());
  applyPositions();
  resetReveals(departed);
  markAllRevealed(frontCard());
  goIdle();
  lockAfterPage(1);
  if (window.syncFxPetals) syncFxPetals();
  requestAnimationFrame(() => {
    fitNameSurnames();
    setTimeout(fitNameSurnames, 350);
  });
}

function finishAdvanceCancel() {
  const incoming = order[1] !== undefined ? cards[order[1]] : null;
  hardResetChrome();
  if (incoming) resetReveals(incoming);
  markAllRevealed(frontCard());
  goIdle();
}

function finishRetreatCommit() {
  const departed = frontCard();
  hardResetChrome();
  order.unshift(order.pop());
  applyPositions();
  resetReveals(departed);
  markAllRevealed(frontCard());
  goIdle();
  lockAfterPage(-1);
  if (window.syncFxPetals) syncFxPetals();
  requestAnimationFrame(() => {
    fitNameSurnames();
    setTimeout(fitNameSurnames, 350);
  });
}

function finishRetreatCancel() {
  const incoming = canRetreat() ? prevCard() : null;
  hardResetChrome();
  if (incoming) resetReveals(incoming);
  markAllRevealed(frontCard());
  goIdle();
}

function animateTo(target, onDone) {
  settling = true;
  clearTimeout(settleTimer);
  if (animFrame) cancelAnimationFrame(animFrame);
  const start = progress;
  const dur = target >= 1 ? 320 : 1; /* cancel path unused — kept instant via onDone */
  const t0 = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - t0) / Math.max(dur, 1));
    const ease = 1 - Math.pow(1 - t, 3);
    setProgress(start + (target - start) * ease);
    if (t < 1) {
      animFrame = requestAnimationFrame(frame);
    } else {
      animFrame = null;
      onDone();
    }
  }
  animFrame = requestAnimationFrame(frame);
}

function settle() {
  if (settling || mode === 'idle') return;
  const shouldCommit = progress >= COMMIT || (progress + velocity * 5) >= COMMIT;

  if (mode === 'advance') {
    if (shouldCommit) animateTo(1, finishAdvanceCommit);
    else finishAdvanceCancel();
  } else if (mode === 'retreat') {
    if (shouldCommit) animateTo(1, finishRetreatCommit);
    else finishRetreatCancel();
  }
}

function scheduleSettle() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, SETTLE_MS);
}

function onDelta(rawDelta, dtMs) {
  if (!rawDelta) return;

  const now = performance.now();
  const gap = lastInputAt ? now - lastInputAt : Infinity;
  lastInputAt = now;

  /*
   * One continuous scroll stream → at most one page.
   * Same-direction leftover flick is ignored.
   * Opposite direction = intentional reverse → unlock immediately
   * (no need to move the mouse).
   * Same direction after a short pause = new scroll → unlock.
   */
  const dir = rawDelta > 0 ? 1 : -1;
  if (pageLocked) {
    const opposite = lockDir && dir !== lockDir;
    const fresh = gap >= NEW_GESTURE_MS;
    if (!opposite && !fresh) return;
    pageLocked = false;
    lockDir = 0;
  }

  if (settling) return;

  const dt = Math.max(8, dtMs || (now - lastT) || 16);
  lastT = now;

  /* Lock mode for the whole gesture — never flip advance↔retreat mid-way */
  if (mode === 'idle') {
    if (rawDelta > 0) {
      if (!canAdvance()) return;
      mode = 'advance';
      progress = 0;
    } else {
      if (!canRetreat()) return;
      mode = 'retreat';
      progress = 0;
    }
  }

  let next = progress;
  if (mode === 'advance') next = progress + rawDelta;
  else next = progress - rawDelta;

  velocity = (next - progress) / (dt / 16);
  setProgress(next);

  if (progress <= 0.001) {
    if (mode === 'advance') finishAdvanceCancel();
    else finishRetreatCancel();
    return;
  }

  if (progress >= 0.999) {
    if (mode === 'advance') finishAdvanceCommit();
    else finishRetreatCommit();
    return;
  }

  scheduleSettle();
}

function nudge(dir) {
  if (settling || pageLocked) return;
  if (dir > 0) {
    if (!canAdvance()) return;
    if (mode === 'retreat') return;
    if (mode === 'idle') { mode = 'advance'; progress = 0; }
    animateTo(1, finishAdvanceCommit);
  } else {
    if (!canRetreat()) return;
    if (mode === 'advance') return;
    if (mode === 'idle') { mode = 'retreat'; progress = 0; }
    animateTo(1, finishRetreatCommit);
  }
}

/* ── Bootstrap ───────────────────────────────────── */
applyPositions();
setTimeout(() => triggerReveals(cards[order[0]]), 400);

/* Stretch each surname end-to-end under its first name via letter-spacing */
function fitNameSurnames() {
  document.querySelectorAll('.cn-name').forEach(wrap => {
    const name = wrap.querySelector('.cn-name__txt');
    const sur  = wrap.querySelector('.cn-surname');
    if (!name || !sur) return;

    /* Natural width first — never measure while width:100% */
    sur.style.letterSpacing = '0px';
    sur.style.width = 'auto';

    const target = name.getBoundingClientRect().width;
    const letters = Array.from(sur.textContent.trim());
    if (letters.length < 2 || target < 4) return;

    const base = sur.getBoundingClientRect().width;
    if (base < 1) return;

    /* ~40% of full end-to-end stretch — was too airy */
    const full = Math.max(0, (target - base) / (letters.length - 1));
    const spacing = full * 0.22;
    sur.style.width = `${base + spacing * (letters.length - 1)}px`;
    sur.style.textAlign = 'center';
    sur.style.letterSpacing = `${spacing}px`;
  });
}
fitNameSurnames();
window.addEventListener('resize', fitNameSurnames);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(fitNameSurnames);
}
setTimeout(fitNameSurnames, 400);
setTimeout(fitNameSurnames, 1000);
setTimeout(fitNameSurnames, 1800);

(function spawnPetals() {
  const layer = document.getElementById('cn-petals');
  if (!layer) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('span');
    p.className = 'cn-petal';
    p.style.left = `${Math.random() * 100}%`;
    p.style.setProperty('--ps', `${9 + Math.random() * 12}px`);
    p.style.setProperty('--pd', `${7 + Math.random() * 7}s`);
    p.style.setProperty('--pdelay', `${Math.random() * 8}s`);
    p.style.setProperty('--px', `${(Math.random() - 0.5) * 80}px`);
    frag.appendChild(p);
  }
  layer.appendChild(frag);
})();

/* Light continuous petals across countdown (3) → events (4) → venue (5) */
(function sharedPetals() {
  const layer = document.getElementById('fx-petals');
  if (!layer) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < 11; i++) {
    const p = document.createElement('span');
    p.className = 'cn-petal';
    p.style.left = `${6 + Math.random() * 88}%`;
    p.style.setProperty('--ps', `${9 + Math.random() * 9}px`);
    p.style.setProperty('--pd', `${8 + Math.random() * 7}s`);
    p.style.setProperty('--pdelay', `${Math.random() * 7}s`);
    p.style.setProperty('--px', `${(Math.random() - 0.5) * 70}px`);
    frag.appendChild(p);
  }
  layer.appendChild(frag);

  const PETAL_PAGES = new Set([3, 4, 5]); /* count, events, venue */

  window.syncFxPetals = function syncFxPetals() {
    layer.classList.toggle('is-on', PETAL_PAGES.has(order[0]));
  };
  syncFxPetals();
})();


/* ════════════════════════════════════════════════════
   INPUT — scrub-linked wheel · touch · keyboard
   ════════════════════════════════════════════════════ */
window.addEventListener('wheel', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  e.preventDefault();
  let dy = e.deltaY;
  /* Normalize line/page deltas so mice aren't almost no-ops */
  if (e.deltaMode === 1) dy *= 16;
  else if (e.deltaMode === 2) dy *= window.innerHeight;
  onDelta(dy * WHEEL_SCALE, 16);
}, { passive: false });

let touchLastX = null;
let touchLastY = null;
let touchLastT = 0;

window.addEventListener('touchstart', e => {
  if (e.target.closest && e.target.closest('input, textarea, select, button')) {
    touchX0 = null;
    return;
  }
  touchX0 = e.touches[0].clientX;
  touchLastX = touchX0;
  touchLastY = e.touches[0].clientY;
  touchLastT = performance.now();
  clearTimeout(settleTimer);
}, { passive: true });

window.addEventListener('touchmove', e => {
  if (touchX0 === null || settling) return;
  const x = e.touches[0].clientX;
  const y = e.touches[0].clientY;
  const now = performance.now();
  const dt = Math.max(8, now - touchLastT);

  const dHoriz = touchLastX - x; /* swipe left → advance */
  const dVert  = y - touchLastY; /* finger down → retreat */

  let delta;
  if (Math.abs(dHoriz) >= Math.abs(dVert)) {
    delta = dHoriz / (window.innerWidth * 0.85);
  } else {
    delta = -dVert / (window.innerHeight * 0.85); /* swipe up → advance */
  }

  touchLastX = x;
  touchLastY = y;
  touchLastT = now;
  onDelta(delta, dt);
}, { passive: true });

window.addEventListener('touchend', () => {
  if (touchX0 === null) return;
  touchX0 = touchLastX = touchLastY = null;
  scheduleSettle();
  /* Finger up ends the gesture — next swipe needs a new touchstart */
  releasePageLock();
}, { passive: true });

window.addEventListener('keydown', e => {
  if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) {
    e.preventDefault();
    nudge(1);
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
    e.preventDefault();
    nudge(-1);
  }
});

window.addEventListener('keyup', e => {
  if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', ' ', 'PageDown', 'PageUp'].includes(e.key)) {
    releasePageLock();
  }
});


/* ════════════════════════════════════════════════════
   COUNTDOWN — parchment flip clock
   ════════════════════════════════════════════════════ */
(function countdown() {
  const elD = document.getElementById('cd-days');
  const elH = document.getElementById('cd-hours');
  const elM = document.getElementById('cd-mins');
  if (!elD || !elH || !elM) return;

  function setDigits(root, value) {
    const u = root.querySelector('.flip__upper .flip__digit');
    const l = root.querySelector('.flip__lower .flip__digit');
    if (u) u.textContent = value;
    if (l) l.textContent = value;
  }

  function clearFlap(root) {
    if (root._flipTimer) {
      clearTimeout(root._flipTimer);
      root._flipTimer = null;
    }
    if (root._flipOnEnd) {
      root._flipOnEnd = null;
    }
    root.classList.remove('is-flipping');
    root.querySelectorAll('.flip__flap').forEach(el => el.remove());
  }

  function flipTo(root, nextRaw) {
    const next = pad(nextRaw);

    /* Always finish any in-flight flip cleanly first */
    if (root.classList.contains('is-flipping') || root.querySelector('.flip__flap')) {
      const committed = root.dataset.val || next;
      clearFlap(root);
      setDigits(root, committed);
    }

    const prev = root.dataset.val;

    if (prev === next) {
      setDigits(root, next);
      return;
    }

    if (prev === undefined || prev === '') {
      root.dataset.val = next;
      setDigits(root, next);
      return;
    }

    root.dataset.val = next;

    /* Fresh flap every flip — avoids stale transform / fill-mode leftovers */
    const flap = document.createElement('div');
    flap.className = 'flip__flap';
    flap.innerHTML =
      '<div class="flip__flap-top"><span class="flip__digit"></span></div>' +
      '<div class="flip__flap-bot"><span class="flip__digit"></span></div>';
    flap.querySelector('.flip__flap-top .flip__digit').textContent = prev;
    flap.querySelector('.flip__flap-bot .flip__digit').textContent = next;
    root.appendChild(flap);

    /* Static halves: top already shows next (revealed as flap leaves);
       bottom stays on prev until flap lands, then both sync to next */
    setDigits(root, prev);
    root.querySelector('.flip__upper .flip__digit').textContent = next;

    void flap.offsetWidth;
    root.classList.add('is-flipping');

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      root._flipTimer = null;
      setDigits(root, root.dataset.val);
      root.classList.remove('is-flipping');
      flap.remove();
    };

    root._flipOnEnd = e => {
      if (e.target !== flap) return;
      done();
    };
    flap.addEventListener('animationend', root._flipOnEnd);
    root._flipTimer = setTimeout(done, 520);
  }

  function tick() {
    const diff = EVENT - Date.now();
    if (diff <= 0) {
      flipTo(elD, 0);
      flipTo(elH, 0);
      flipTo(elM, 0);
      return;
    }
    flipTo(elD, Math.floor(diff / 86400000));
    flipTo(elH, Math.floor((diff % 86400000) / 3600000));
    flipTo(elM, Math.floor((diff % 3600000) / 60000));
  }

  tick();
  setInterval(tick, 1000);
})();


/* ════════════════════════════════════════════════════
   RSVP
   ════════════════════════════════════════════════════ */
(function rsvp() {
  const form = document.getElementById('rsvp-form');
  if (!form) return;

  const nameInput  = document.getElementById('f-name');
  const noteInput  = document.getElementById('f-note');
  const guestsWrap = document.getElementById('guests-wrap');
  const guestsInp  = document.getElementById('f-guests');
  const nameHint   = document.getElementById('f-name-hint');
  const noteHint   = document.getElementById('f-note-hint');
  const guestsHint = document.getElementById('f-guests-hint');
  const btn        = document.getElementById('rf-btn');
  const ok         = document.getElementById('rf-ok');
  const err        = document.getElementById('rf-err');

  const MSG_YES = 'Thank you \u2014 we cannot wait to celebrate with you \u2661';
  const MSG_NO  = 'Thank you for letting us know \u2014 you will be missed, and we hope to celebrate with you another time \u2661';

  /* Letters + spaces only (incl. common name marks), max 30 */
  const NAME_OK = /^[A-Za-z][A-Za-z\s'.-]{0,29}$/;
  /* Letters, numbers, spaces, , + - . ' ! ? — no $ # @ */
  const NOTE_CHAR_OK = /^[A-Za-z0-9\s,.+\-'!?]*$/;

  function showHint(el, on) {
    if (el) el.hidden = !on;
  }

  function clearFieldErrors() {
    [nameInput, noteInput, guestsInp].forEach(el => el && el.classList.remove('invalid'));
    showHint(nameHint, false);
    showHint(noteHint, false);
    showHint(guestsHint, false);
  }

  function wordCount(str) {
    const t = str.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  /* Live sanitize: strip disallowed characters as they type */
  nameInput.addEventListener('input', () => {
    const cleaned = nameInput.value
      .replace(/[^A-Za-z\s'.-]/g, '')
      .slice(0, 30);
    if (cleaned !== nameInput.value) nameInput.value = cleaned;
    nameInput.classList.remove('invalid');
    showHint(nameHint, false);
  });

  noteInput.addEventListener('input', () => {
    let v = noteInput.value.replace(/[$ #@]/g, '');
    /* also strip any other symbols outside the allow-list */
    v = v.replace(/[^A-Za-z0-9\s,.+\-'!?]/g, '');
    const words = v.trim() ? v.trim().split(/\s+/) : [];
    if (words.length > 100) {
      v = words.slice(0, 100).join(' ');
    }
    if (v !== noteInput.value) noteInput.value = v;
    noteInput.classList.remove('invalid');
    showHint(noteHint, false);
  });

  if (guestsInp) {
    guestsInp.addEventListener('input', () => {
      guestsInp.classList.remove('invalid');
      showHint(guestsHint, false);
    });
  }

  form.querySelectorAll('input[name="attending"]').forEach(r => {
    r.addEventListener('change', () => {
      const yes = r.value === 'Yes' && r.checked;
      guestsWrap.hidden = !yes;
      if (guestsInp) {
        guestsInp.required = yes;
        if (!yes) {
          guestsInp.value = '';
          guestsInp.classList.remove('invalid');
          showHint(guestsHint, false);
        }
      }
    });
  });

  function validate() {
    clearFieldErrors();
    let firstBad = null;

    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    nameInput.value = name;

    if (!name || !NAME_OK.test(name) || name.length > 30) {
      nameInput.classList.add('invalid');
      showHint(nameHint, true);
      firstBad = firstBad || nameInput;
    }

    const attending = form.querySelector('input[name="attending"]:checked')?.value;
    if (!attending) {
      firstBad = firstBad || form.querySelector('.rf-radios');
    }

    if (attending === 'Yes') {
      guestsWrap.hidden = false;
      if (guestsInp) guestsInp.required = true;
      const raw = (guestsInp?.value || '').trim();
      const g = parseInt(raw, 10);
      if (!raw || !Number.isInteger(g) || g < 1 || g > 10) {
        guestsInp.classList.add('invalid');
        showHint(guestsHint, true);
        firstBad = firstBad || guestsInp;
      }
    } else if (guestsInp) {
      guestsInp.required = false;
    }

    const note = noteInput.value.trim();
    if (note) {
      if (!NOTE_CHAR_OK.test(note) || /[$ #@]/.test(note) || wordCount(note) > 100) {
        noteInput.classList.add('invalid');
        showHint(noteHint, true);
        firstBad = firstBad || noteInput;
      }
    }

    if (firstBad && firstBad.focus) firstBad.focus();
    return { ok: !firstBad, name, attending, note };
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    ok.hidden = err.hidden = true;
    ok.textContent = '';

    const result = validate();
    if (!result.ok) return;

    btn.disabled = true;
    btn.textContent = 'Sending\u2026';

    const payload = {
      name: result.name,
      attending: result.attending,
      guests: result.attending === 'Yes' ? (guestsInp?.value || '') : '',
      note: result.note || '',
      ts: new Date().toISOString(),
    };

    try {
      if (!SHEETS_URL || SHEETS_URL.startsWith('YOUR_')) {
        await new Promise(r => setTimeout(r, 900));
      } else {
        /* text/plain + no-cors avoids CORS preflight; Apps Script still gets JSON body */
        await fetch(SHEETS_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });
      }
      ok.textContent = result.attending === 'Yes' ? MSG_YES : MSG_NO;
      ok.hidden = false;
      form.reset();
      guestsWrap.hidden = true;
      clearFieldErrors();
    } catch {
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send with love';
    }
  });
})();
