/* ════════════════════════════════════════════════
   NishKiNishaani — script.js
   ════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────
   GOOGLE SHEETS RSVP CONFIGURATION
   ──────────────────────────────────────────────
   SETUP INSTRUCTIONS:

   Step 1 — Open your Google Sheet (create one if needed, with columns:
             Timestamp | Name | Attending | Guests | Message)

   Step 2 — In the Sheet, go to: Extensions → Apps Script

   Step 3 — Paste this code and save (name it anything):

   ┌───────────────────────────────────────────────
   │ function doPost(e) {
   │   const sheet = SpreadsheetApp
   │     .getActiveSpreadsheet().getActiveSheet();
   │   const data = JSON.parse(e.postData.contents);
   │   sheet.appendRow([
   │     new Date(),
   │     data.name      || '',
   │     data.attending || '',
   │     data.guests    || '',
   │     data.message   || ''
   │   ]);
   │   return ContentService
   │     .createTextOutput(JSON.stringify({ ok: true }))
   │     .setMimeType(ContentService.MimeType.JSON);
   │ }
   └───────────────────────────────────────────────

   Step 4 — Click "Deploy" → "New deployment"
             Type: Web app | Execute as: Me | Access: Anyone
             Copy the Web App URL

   Step 5 — Paste the URL below, replacing the placeholder

   ────────────────────────────────────────────── */

// TODO: Replace with your Apps Script Web App URL
const RSVP_ENDPOINT = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

// TODO: Update with confirmed event time once known
// Format: 'YYYY-MM-DDTHH:MM:SS+05:30'  (IST = UTC+5:30)
const EVENT_DATE = new Date('2026-10-20T18:00:00+05:30');


/* ════════════════════════════════════════════════
   STARS
   ════════════════════════════════════════════════ */
(function generateStars() {
  const layer = document.querySelector('.stars-layer');
  if (!layer) return;

  // Inject twinkle keyframe once
  const style = document.createElement('style');
  style.textContent = `
    @keyframes twinkle {
      0%, 100% { opacity: 0.25; transform: scale(1); }
      50%       { opacity: 1;    transform: scale(1.6); }
    }
  `;
  document.head.appendChild(style);

  const count = 90;
  const frag  = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const s    = document.createElement('div');
    const size = Math.random() < 0.72 ? 1 : 2;
    const x    = Math.random() * 100;
    const y    = Math.random() * 60;       // only top 60% = sky
    const dur  = (2.5 + Math.random() * 4).toFixed(2);
    const del  = (Math.random() * 5).toFixed(2);
    const op   = (0.3 + Math.random() * 0.65).toFixed(2);

    s.style.cssText = [
      'position:absolute',
      `left:${x}%`,
      `top:${y}%`,
      `width:${size}px`,
      `height:${size}px`,
      'border-radius:50%',
      `background:rgba(255,240,210,${op})`,
      `animation:twinkle ${dur}s ease-in-out ${del}s infinite`,
    ].join(';');

    frag.appendChild(s);
  }
  layer.appendChild(frag);
})();


/* ════════════════════════════════════════════════
   PARALLAX  (hero layers on scroll)
   ════════════════════════════════════════════════ */
(function initParallax() {
  const hero   = document.getElementById('hero');
  const layers = hero ? Array.from(hero.querySelectorAll('[data-parallax]')) : [];

  if (!layers.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // The palace-layer animation uses transform; once it ends we remove the
  // animation so the JS inline style can drive parallax without conflict.
  const palace = hero.querySelector('.palace-layer');
  if (palace) {
    palace.addEventListener('animationend', () => {
      palace.style.animation = 'none';
      palace.style.opacity   = '1';
      palace.style.transform = 'translateX(-50%) translateY(0)';
    }, { once: true });
  }

  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        layers.forEach(el => {
          const speed = parseFloat(el.dataset.parallax) || 0;
          el.style.transform = el.classList.contains('palace-layer')
            ? `translateX(-50%) translateY(${scrollY * speed}px)`
            : `translateY(${scrollY * speed}px)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();


/* ════════════════════════════════════════════════
   COUNTDOWN
   ════════════════════════════════════════════════ */
(function initCountdown() {
  const els = {
    d: document.getElementById('days'),
    h: document.getElementById('hours'),
    m: document.getElementById('minutes'),
    s: document.getElementById('seconds'),
  };
  if (!els.d) return;

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const diff = EVENT_DATE - Date.now();

    if (diff <= 0) {
      els.d.textContent = '00';
      els.h.textContent = '00';
      els.m.textContent = '00';
      els.s.textContent = '00';
      return;
    }

    els.d.textContent = pad(Math.floor(diff / 86400000));
    els.h.textContent = pad(Math.floor((diff % 86400000) / 3600000));
    els.m.textContent = pad(Math.floor((diff % 3600000)  / 60000));
    els.s.textContent = pad(Math.floor((diff % 60000)    / 1000));
  }

  tick();
  setInterval(tick, 1000);
})();


/* ════════════════════════════════════════════════
   SCROLL REVEAL
   ════════════════════════════════════════════════ */
(function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in-view'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  items.forEach(el => io.observe(el));
})();


/* ════════════════════════════════════════════════
   FLORAL CORNER SVG
   ════════════════════════════════════════════════ */
(function drawFloral() {
  const floralSVG = `
    <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <!-- Main stems -->
      <path d="M 8,8 C 30,24 55,55 92,78" stroke="#9b4f6a" stroke-width="1.1" fill="none" opacity="0.45"/>
      <path d="M 8,8 C 24,30 50,68 72,100" stroke="#9b4f6a" stroke-width="1.1" fill="none" opacity="0.4"/>
      <path d="M 8,8 C 22,18 46,30 65,42"  stroke="#c9a84c" stroke-width="0.9" fill="none" opacity="0.38"/>
      <path d="M 8,8 C 16,26 30,48 42,72"  stroke="#c9a84c" stroke-width="0.9" fill="none" opacity="0.32"/>
      <!-- Smaller branch -->
      <path d="M 32,30 C 42,25 58,28 68,36" stroke="#9b4f6a" stroke-width="0.7" fill="none" opacity="0.28"/>
      <path d="M 28,48 C 22,58 30,72 38,80"  stroke="#c4849a" stroke-width="0.7" fill="none" opacity="0.25"/>

      <!-- Leaves -->
      <ellipse cx="68" cy="50" rx="10" ry="4.5" transform="rotate(-35,68,50)" fill="#6b1a33" opacity="0.22"/>
      <ellipse cx="46" cy="74" rx="9"  ry="4"   transform="rotate(18,46,74)"  fill="#6b1a33" opacity="0.2"/>
      <ellipse cx="80" cy="68" rx="8"  ry="3.5" transform="rotate(-55,80,68)" fill="#6b1a33" opacity="0.18"/>

      <!-- Large flowers -->
      <circle cx="92" cy="78" r="8"   fill="#9b4f6a" opacity="0.65"/>
      <circle cx="92" cy="78" r="4"   fill="#e8c5b5" opacity="0.85"/>
      <circle cx="72" cy="100" r="7"  fill="#9b4f6a" opacity="0.58"/>
      <circle cx="72" cy="100" r="3.5" fill="#e8c5b5" opacity="0.8"/>

      <!-- Medium flowers -->
      <circle cx="65" cy="42" r="5.5" fill="#c9a84c" opacity="0.6"/>
      <circle cx="65" cy="42" r="2.5" fill="#faf0e6" opacity="0.9"/>
      <circle cx="42" cy="72" r="4.5" fill="#c9a84c" opacity="0.5"/>

      <!-- Petals on large flowers -->
      <circle cx="84" cy="72" r="3.5" fill="#c4849a" opacity="0.45"/>
      <circle cx="100" cy="72" r="3.5" fill="#c4849a" opacity="0.4"/>
      <circle cx="88" cy="88" r="3.5" fill="#c4849a" opacity="0.4"/>

      <!-- Small buds -->
      <circle cx="50" cy="55" r="3"   fill="#c4849a" opacity="0.38"/>
      <circle cx="36" cy="62" r="2.5" fill="#c4849a" opacity="0.32"/>
      <circle cx="60" cy="82" r="2.5" fill="#c4849a" opacity="0.3"/>
      <circle cx="78" cy="58" r="2"   fill="#c9a84c" opacity="0.35"/>

      <!-- Gold dots accent -->
      <circle cx="55" cy="30" r="1.5" fill="#c9a84c" opacity="0.5"/>
      <circle cx="28" cy="38" r="1.5" fill="#c9a84c" opacity="0.45"/>
      <circle cx="20" cy="58" r="1.5" fill="#c9a84c" opacity="0.4"/>
    </svg>
  `;

  document.querySelectorAll('.floral-corner').forEach(el => {
    el.innerHTML = floralSVG;
  });
})();


/* ════════════════════════════════════════════════
   RSVP FORM
   ════════════════════════════════════════════════ */
(function initRSVP() {
  const form       = document.getElementById('rsvp-form');
  const btn        = document.getElementById('rsvp-btn');
  const msgOk      = document.getElementById('msg-success');
  const msgErr     = document.getElementById('msg-error');
  const guestField = document.getElementById('guests-field');
  const radios     = document.querySelectorAll('input[name="attending"]');

  if (!form) return;

  // Toggle guest count field
  radios.forEach(r => {
    r.addEventListener('change', () => {
      guestField.style.display = r.value === 'Yes' && r.checked ? 'block' : 'none';
    });
  });

  // Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFeedback();

    const name      = form.elements['name'].value.trim();
    const attending = form.querySelector('input[name="attending"]:checked')?.value;
    const guests    = form.elements['guests'].value;
    const message   = form.elements['message'].value.trim();

    // Client-side validation
    let valid = true;
    if (!name) {
      highlight(form.elements['name']);
      valid = false;
    }
    if (!attending) {
      document.querySelectorAll('.radio-pip').forEach(pip => {
        pip.style.borderColor = '#a02020';
      });
      valid = false;
    }
    if (!valid) return;

    // Loading state
    const btnText = btn.querySelector('.btn-text');
    btn.disabled = true;
    btnText.textContent = 'Sending…';

    const payload = {
      name,
      attending,
      guests: guests || '',
      message,
      timestamp: new Date().toISOString(),
    };

    try {
      if (!RSVP_ENDPOINT || RSVP_ENDPOINT === 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') {
        // Demo mode — simulate network delay
        await sleep(900);
        showSuccess();
      } else {
        // Google Apps Script requires no-cors; we can't read the response,
        // but the data will be written to the sheet.
        await fetch(RSVP_ENDPOINT, {
          method:  'POST',
          mode:    'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        showSuccess();
      }
    } catch (err) {
      console.error('[RSVP]', err);
      msgErr.hidden = false;
    } finally {
      btn.disabled = false;
      btnText.textContent = 'Send RSVP';
    }
  });

  function showSuccess() {
    msgOk.hidden = false;
    form.reset();
    guestField.style.display = 'none';
    msgOk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearFeedback() {
    msgOk.hidden = true;
    msgErr.hidden = true;
    // Reset validation highlights
    form.querySelectorAll('input, textarea').forEach(el => el.style.borderBottomColor = '');
    document.querySelectorAll('.radio-pip').forEach(pip => pip.style.borderColor = '');
  }

  function highlight(el) {
    el.style.borderBottomColor = '#a02020';
    el.addEventListener('input', () => { el.style.borderBottomColor = ''; }, { once: true });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
