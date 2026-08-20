/* ════════════════════════════════════════════════════
   NishKiNishaani  ·  Card Deck Engine  ·  7 cards
   Scrub-driven motion: scroll/touch links to progress.
   ════════════════════════════════════════════════════ */

const SHEETS_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

/* ── Monogram: strip black background ─────────────── */
(function stripMonogramBlack() {
  const img = document.querySelector('.ci-monogram');
  if (!img) return;

  function process() {
    try {
      const W = img.naturalWidth  || img.width;
      const H = img.naturalHeight || img.height;
      if (!W || !H) return;

      const canvas = document.createElement('canvas');
      canvas.width  = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const id  = ctx.getImageData(0, 0, W, H);
      const px  = id.data;
      const LOW = 55;
      const HIGH = 110;

      for (let i = 0; i < px.length; i += 4) {
        const lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        if (lum <= LOW) px[i + 3] = 0;
        else if (lum < HIGH) px[i + 3] = Math.round((lum - LOW) / (HIGH - LOW) * 255);
      }

      ctx.putImageData(id, 0, 0);
      img.src = canvas.toDataURL('image/png');
    } catch (e) { /* ignore */ }
  }

  if (img.complete && img.naturalWidth) process();
  else img.addEventListener('load', process, { once: true });
})();

const EVENT = new Date('2026-10-20T17:00:00+05:30');
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
    card.style.borderRadius = '';
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

  const textSel = 'p, .ci-hero, .ci-tag, .cn-name__txt, .cn-and, .cn-post__txt, .cs-label, .cs-day, .cs-month, .cs-year, .cc-num, .cc-uname, .ce-time, .ce-name, .cv-name, .cv-place, .cm-title';
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
  const TILE = 64;
  const cols = Math.ceil(W / TILE) + 1;
  const rows = Math.ceil(H / TILE) + 1;
  const cx = W / 2;
  const cy = H / 2;
  const tiles = [];
  const frag = document.createDocumentFragment();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const el = document.createElement('div');
      const tx = c * TILE;
      const ty = r * TILE;
      const midX = tx + TILE / 2;
      const midY = ty + TILE / 2;
      const dx = midX - cx;
      const dy = midY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = 100 + Math.random() * 160;
      el.className = 'scrub-tile';
      el.style.cssText =
        `position:fixed;left:${tx}px;top:${ty}px;` +
        `width:${TILE + 1}px;height:${TILE + 1}px;` +
        `background-image:url(${url});` +
        `background-size:${W}px ${H}px;` +
        `background-position:-${tx}px -${ty}px;` +
        `z-index:1000;pointer-events:none;` +
        `will-change:transform,opacity;` +
        `transform:translate(0px,0px) rotate(0deg) scale(1);opacity:1;`;
      frag.appendChild(el);
      tiles.push({
        el,
        bx: (dx / dist) * speed,
        by: (dy / dist) * speed,
        br: (Math.random() - 0.5) * 100,
      });
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
    f.classList.add('is-scrubbing');
    f.style.zIndex = '11';
    f.style.transform = `translateX(${p * 105}%) rotate(${p * 14}deg)`;
    f.style.borderRadius = `${p * 28}px`;
    return;
  }

  if (mode === 'retreat') {
    /* Every retreat (including 2→1) rolls the previous card in from the left.
       Scatter-on-retreat was flashing the wrong under-card (page 3). */
    const prev = prevCard();
    armPrevCard(prev);
    const t = 1 - p;
    prev.style.transform = `translateX(${-105 * t}%) rotate(${-14 * t}deg)`;
    prev.style.borderRadius = `${28 * t}px`;

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
   COUNTDOWN
   ════════════════════════════════════════════════════ */
(function countdown() {
  const elD = document.getElementById('cd-days');
  const elH = document.getElementById('cd-hours');
  const elM = document.getElementById('cd-mins');
  if (!elD || !elH || !elM) return;

  function tick() {
    const diff = EVENT - Date.now();
    if (diff <= 0) {
      elD.textContent = elH.textContent = elM.textContent = '00';
      return;
    }
    elD.textContent = pad(Math.floor(diff / 86400000));
    elH.textContent = pad(Math.floor((diff % 86400000) / 3600000));
    elM.textContent = pad(Math.floor((diff % 3600000) / 60000));
  }
  tick();
  setInterval(tick, 30_000);
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
  const btn        = document.getElementById('rf-btn');
  const ok         = document.getElementById('rf-ok');
  const err        = document.getElementById('rf-err');

  form.querySelectorAll('input[name="attending"]').forEach(r => {
    r.addEventListener('change', () => {
      guestsWrap.hidden = r.value !== 'Yes';
      if (guestsWrap.hidden && guestsInp) guestsInp.value = '';
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    ok.hidden = err.hidden = true;

    const name = nameInput.value.trim();
    const attending = form.querySelector('input[name="attending"]:checked')?.value;

    if (!name) {
      nameInput.classList.add('invalid');
      nameInput.focus();
      return;
    }
    if (!attending) return;

    btn.disabled = true;
    btn.textContent = 'Sending\u2026';

    const payload = {
      name,
      attending,
      guests: guestsInp?.value || '',
      note: noteInput?.value.trim() || '',
      ts: new Date().toISOString(),
    };

    try {
      if (!SHEETS_URL || SHEETS_URL.startsWith('YOUR_')) {
        await new Promise(r => setTimeout(r, 900));
      } else {
        await fetch(SHEETS_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      ok.hidden = false;
      form.reset();
      guestsWrap.hidden = true;
    } catch {
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send with love';
    }
  });

  nameInput.addEventListener('input', () => nameInput.classList.remove('invalid'));
})();
