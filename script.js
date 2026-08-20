/* ════════════════════════════════════════════════════
   NishKiNishaani  ·  Card Deck Engine  ·  7 cards
   ════════════════════════════════════════════════════ */

/* ── Google Sheets RSVP endpoint ──────────────────
   SETUP:
   1. Open your Google Sheet → Extensions → Apps Script
   2. Paste the function below and deploy as Web App (Anyone):

   function doPost(e) {
     var s = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     var d = JSON.parse(e.postData.contents);
     s.appendRow([new Date(), d.name, d.attending, d.guests||'', d.note||'', d.ts]);
     return ContentService
       .createTextOutput(JSON.stringify({ok:true}))
       .setMimeType(ContentService.MimeType.JSON);
   }

   3. Paste your deployed URL here:
   ────────────────────────────────────────────────── */
const SHEETS_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

/* ════════════════════════════════════════════════════
   MONOGRAM — strip black background via Canvas API
   Draws the PNG into an offscreen canvas, walks every
   pixel, and sets dark pixels to transparent so the
   gold / floral art floats cleanly on any background.
   ════════════════════════════════════════════════════ */
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

      const id   = ctx.getImageData(0, 0, W, H);
      const px   = id.data;
      const LOW  = 55;   /* fully transparent below this luminance */
      const HIGH = 110;  /* fully opaque above this luminance */

      for (let i = 0; i < px.length; i += 4) {
        /* perceptual luminance */
        const lum = px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114;
        if (lum <= LOW) {
          px[i+3] = 0;                                               /* fully transparent */
        } else if (lum < HIGH) {
          px[i+3] = Math.round((lum - LOW) / (HIGH - LOW) * 255);   /* soft edge */
        }
        /* lum >= HIGH → keep original alpha (opaque) */
      }

      ctx.putImageData(id, 0, 0);
      img.src = canvas.toDataURL('image/png');
    } catch (e) { /* cross-origin guard — silently skip */ }
  }

  if (img.complete && img.naturalWidth) {
    process();
  } else {
    img.addEventListener('load', process, { once: true });
  }
})();

/* Engagement date & time */
const EVENT = new Date('2026-10-20T17:00:00+05:30');

const TOTAL = 7;


/* ════════════════════════════════════════════════════
   DECK ENGINE  —  circular, always-on-top
   ════════════════════════════════════════════════════ */
const cards = Array.from(document.querySelectorAll('.card'));

/* order[0] = which card (DOM index) is currently at the front */
let order = cards.map((_, i) => i); // [0,1,2,3,4,5,6]
let busy  = false;

function applyPositions() {
  order.forEach((cardIdx, pos) => {
    cards[cardIdx].dataset.pos = pos;
  });
}

function resetReveals(cardEl) {
  cardEl.querySelectorAll('[data-r].revealed').forEach(el => {
    el.classList.remove('revealed');
  });
}

function triggerReveals(cardEl) {
  cardEl.querySelectorAll('[data-r]').forEach(el => {
    const delay = parseInt(el.dataset.d, 10) || 0;
    setTimeout(() => el.classList.add('revealed'), delay);
  });
}

/* ════════════════════════════════════════════════════
   DISSOLVE ADVANCE  —  card 1 shatters into tiles
   ─────────────────────────────────────────────────
   Correct sequencing to avoid the blank-screen glitch:

   1. Departing card is pinned at z-index:999 (stays
      visible on top — user never loses sight of it).
   2. Deck advances IMMEDIATELY behind it (card 2 goes
      to pos 0 at z-index 10, hidden under card 1).
   3. Tiles at z-index:1000 are created & painted over
      the departing card (double-rAF ensures paint).
   4. Tiles scatter outward while departing card fades.
      Behind the fading card 1: card 2 is already there.
   5. Cleanup resets card 1 to its back-of-deck slot.
   ════════════════════════════════════════════════════ */
function dissolveAdvance() {
  busy = true;

  const TILE  = 46;
  const W     = window.innerWidth;
  const H     = window.innerHeight;
  const cols  = Math.ceil(W / TILE) + 1;
  const rows  = Math.ceil(H / TILE) + 1;
  const cx    = W / 2;
  const cy    = H / 2;
  const maxR  = Math.hypot(cx, cy);
  const tiles = [];
  const frag  = document.createDocumentFragment();

  /* ── Step 1: pin the departing card on top ── */
  const departing = cards[order[0]];
  departing.style.zIndex       = '999';
  departing.style.pointerEvents = 'none';

  /* ── Step 2: advance deck silently behind it ── */
  order.push(order.shift());
  /* Apply positions to every card EXCEPT departing (it has inline z-index 999) */
  order.forEach((cardIdx, pos) => { cards[cardIdx].dataset.pos = pos; });
  resetReveals(departing);
  triggerReveals(cards[order[0]]);

  /* ── Step 3: build opaque tiles at z-index 1000 ── */
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const el   = document.createElement('div');
      const tx   = c * TILE;
      const ty   = r * TILE;
      const midX = tx + TILE / 2;
      const midY = ty + TILE / 2;
      el.style.cssText =
        `position:fixed;left:${tx}px;top:${ty}px;` +
        `width:${TILE + 1}px;height:${TILE + 1}px;` +
        `background:rgba(236,220,196,0.92);` + /* warm parchment, nearly opaque */
        `z-index:1000;pointer-events:none;` +
        `will-change:transform,opacity;`;
      frag.appendChild(el);
      tiles.push({ el, midX, midY });
    }
  }
  document.body.appendChild(frag);

  /* ── Step 4: double-rAF → tiles are confirmed painted ── */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {

      /* Fade departing card out while tiles scatter — behind fading card 1, card 2 awaits */
      departing.style.transition = 'opacity 0.65s ease';
      departing.style.opacity    = '0';

      /* Scatter tiles: centre-out, slow and deliberate */
      tiles.forEach(({ el, midX, midY }) => {
        const dx    = midX - cx;
        const dy    = midY - cy;
        const dist  = Math.hypot(dx, dy) || 1;
        const delay = 40 + (dist / maxR) * 320 + Math.random() * 180;
        const speed = 80 + Math.random() * 130;
        const rot   = (Math.random() - 0.5) * 90;

        setTimeout(() => {
          el.style.transition =
            `transform ${0.42 + Math.random() * 0.26}s cubic-bezier(0.4,0,0.9,0.7),` +
            `opacity   ${0.32 + Math.random() * 0.18}s ease`;
          el.style.transform =
            `translate(${(dx / dist) * speed}px,${(dy / dist) * speed}px)` +
            ` rotate(${rot}deg) scale(0.04)`;
          el.style.opacity = '0';
        }, delay);
      });

    });
  });

  /* ── Step 5: cleanup — reset departing card to back-of-deck ── */
  setTimeout(() => {
    tiles.forEach(({ el }) => el.parentNode && el.parentNode.removeChild(el));

    /* Silently snap departing card to its correct back-of-deck position */
    departing.classList.add('no-transition');
    departing.style.zIndex        = '';
    departing.style.opacity       = '';
    departing.style.transition    = '';
    departing.style.pointerEvents = '';
    departing.dataset.pos         = order.length - 1; /* it's last in order */
    departing.getBoundingClientRect(); /* force reflow */
    departing.classList.remove('no-transition');

    busy = false;
  }, 1150);
}

/* ── Advance: front card flies to back ──────────────── */
function advance() {
  if (busy || order[0] >= TOTAL - 1) return; /* stop at last card */

  /* Card 1 (the invite) gets the tile-shatter dissolve */
  if (order[0] === 0) { dissolveAdvance(); return; }

  busy = true;

  const frontCard = cards[order[0]];
  frontCard.classList.add('is-flying-out');

  setTimeout(() => {
    frontCard.classList.add('no-transition');
    frontCard.classList.remove('is-flying-out');

    order.push(order.shift()); /* [0,1,2,…] → [1,2,…,0] */
    applyPositions();
    resetReveals(cards[order[order.length - 1]]); /* reset the card that just left front */

    frontCard.getBoundingClientRect(); /* force reflow */
    frontCard.classList.remove('no-transition');

    triggerReveals(cards[order[0]]);
    setTimeout(() => { busy = false; }, 350);
  }, 580);
}

/* ── Retreat: bring back card to front ──────────────── */
function retreat() {
  if (busy || order[0] <= 0) return; /* stop at first card */
  busy = true;

  order.unshift(order.pop()); /* [0,1,2,…] → [6,0,1,…] */
  applyPositions();
  triggerReveals(cards[order[0]]);

  setTimeout(() => { busy = false; }, 680);
}

/* ── Jump directly to a card by its original DOM index ── */
function goTo(targetIdx) {
  if (busy || order[0] === targetIdx) return;
  /* Rotate order until target is at front */
  busy = true;
  order = [...cards.keys()].map((_, i) =>
    (targetIdx + i) % TOTAL
  );
  applyPositions();
  triggerReveals(cards[order[0]]);
  setTimeout(() => { busy = false; }, 680);
}

/* ── Bootstrap ───────────────────────────────────── */
applyPositions();
/* Reveal card 1 after a brief entrance pause */
setTimeout(() => triggerReveals(cards[order[0]]), 400);

/* ── Card 2: falling petals only ─────────────────── */
(function spawnPetals() {
  const layer = document.getElementById('cn-petals');
  if (!layer) return;

  const N_PETALS = 22;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < N_PETALS; i++) {
    const p = document.createElement('span');
    p.className = 'cn-petal';
    p.style.left = `${Math.random() * 100}%`;
    p.style.setProperty('--ps',     `${9 + Math.random() * 12}px`);
    p.style.setProperty('--pd',     `${7 + Math.random() * 7}s`);
    p.style.setProperty('--pdelay', `${Math.random() * 8}s`);
    p.style.setProperty('--px',     `${(Math.random() - 0.5) * 80}px`);
    frag.appendChild(p);
  }

  layer.appendChild(frag);
})();


/* ════════════════════════════════════════════════════
   INPUT — scroll · swipe · keyboard · dots
   ════════════════════════════════════════════════════ */

/* Wheel — consistent on all cards, boundaries prevent wrap-around */
let wheelBucket = 0;
window.addEventListener('wheel', e => {
  wheelBucket += e.deltaY;
  if (Math.abs(wheelBucket) >= 55) {
    wheelBucket > 0 ? advance() : retreat();
    wheelBucket = 0;
  }
}, { passive: true });

/* Touch swipe (horizontal dominates) */
let tx0 = null, ty0 = null;
window.addEventListener('touchstart', e => {
  tx0 = e.touches[0].clientX;
  ty0 = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchend', e => {
  if (tx0 === null) return;
  const dx = tx0 - e.changedTouches[0].clientX;
  const dy = Math.abs(ty0 - e.changedTouches[0].clientY);
  if (Math.abs(dx) > 44 && Math.abs(dx) > dy + 10) {
    dx > 0 ? advance() : retreat();
  }
  tx0 = ty0 = null;
}, { passive: true });

/* Keyboard */
window.addEventListener('keydown', e => {
  if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) {
    e.preventDefault(); advance();
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
    e.preventDefault(); retreat();
  }
});


/* ════════════════════════════════════════════════════
   COUNTDOWN  —  days / hours / minutes
   ════════════════════════════════════════════════════ */
(function countdown() {
  const elD = document.getElementById('cd-days');
  const elH = document.getElementById('cd-hours');
  const elM = document.getElementById('cd-mins');
  if (!elD || !elH || !elM) return;

  function tick() {
    const diff = EVENT - Date.now();
    if (diff <= 0) {
      elD.textContent = '00';
      elH.textContent = '00';
      elM.textContent = '00';
      return;
    }
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);
    elD.textContent = pad(days);
    elH.textContent = pad(hours);
    elM.textContent = pad(mins);
  }
  tick();
  setInterval(tick, 30_000);
})();


/* ════════════════════════════════════════════════════
   RSVP / SEND A MESSAGE
   ════════════════════════════════════════════════════ */
(function rsvp() {
  const form       = document.getElementById('rsvp-form');
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

    const name      = nameInput.value.trim();
    const attending = form.querySelector('input[name="attending"]:checked')?.value;

    if (!name) {
      nameInput.classList.add('invalid');
      nameInput.focus();
      return;
    }
    if (!attending) return;

    btn.disabled    = true;
    btn.textContent = 'Sending\u2026';

    const payload = {
      name,
      attending,
      guests: guestsInp?.value || '',
      note:   noteInput?.value.trim() || '',
      ts:     new Date().toISOString(),
    };

    try {
      if (!SHEETS_URL || SHEETS_URL.startsWith('YOUR_')) {
        await new Promise(r => setTimeout(r, 900)); /* demo mode */
      } else {
        await fetch(SHEETS_URL, {
          method: 'POST',
          mode:   'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body:   JSON.stringify(payload),
        });
      }
      ok.hidden = false;
      form.reset();
      guestsWrap.hidden = true;
    } catch {
      err.hidden = false;
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Send with love';
    }
  });

  nameInput.addEventListener('input', () => nameInput.classList.remove('invalid'));
})();
