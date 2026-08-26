/**
 * NishKiNishaani RSVP → Google Sheet + email alert
 *
 * Setup:
 * 1. Create a Google Sheet
 * 2. Row 1 headers (order can vary — matched by name):
 *      Timestamp | Name | Side | Attending | Guests | Note
 * 3. Extensions → Apps Script → paste this file → Save
 * 4. IMPORTANT — authorise email (do this once):
 *      Run → testRsvpEmail → Allow → check both inboxes (and spam)
 * 5. Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 *    Updates: Deploy → Manage deployments → ✎ → New version → Deploy
 * 6. Open the Web app URL in a browser — must say "…endpoint is live."
 * 7. Paste that URL into script.js → SHEETS_URL
 *
 * Payload from the site:
 *   { ts, name, side, attending, guests, note }
 */

/** Comma-separated alert recipients */
const NOTIFY_EMAILS = 'nishkinishaani@gmail.com';

const MAIL_LOG_SHEET = 'Mail Log';

function headerKey_(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function valueForHeader_(key, data) {
  if (key === 'timestamp' || key === 'ts' || key === 'time') {
    return data.ts || new Date().toISOString();
  }
  if (key === 'name' || key === 'guestname') return data.name || '';
  if (key === 'side' || key === 'party' || key === 'from') return data.side || '';
  if (key === 'attending' || key === 'rsvp' || key === 'attendance') {
    return data.attending || '';
  }
  if (key === 'guests' || key === 'guestcount' || key === 'pax') {
    return data.guests || '';
  }
  if (key === 'note' || key === 'message' || key === 'notes' || key === 'wish') {
    return data.note || '';
  }
  return '';
}

function notifyRecipients_() {
  const listed = String(NOTIFY_EMAILS || '')
    .split(',')
    .map(function(s) { return s.trim(); })
    .filter(Boolean);
  if (listed.length) return listed;

  const owner = Session.getEffectiveUser().getEmail();
  return owner ? [owner] : [];
}

function mailLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName(MAIL_LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(MAIL_LOG_SHEET);
    log.appendRow(['Timestamp', 'Status', 'Recipient', 'Detail']);
  }
  return log;
}

function logMail_(status, recipient, detail) {
  try {
    mailLogSheet_().appendRow([
      new Date(),
      status,
      recipient || '',
      String(detail || '').slice(0, 500),
    ]);
  } catch (e) {
    console.error('Mail log failed: ' + e);
  }
}

function sideSignOff_(side) {
  const s = String(side || '').trim();
  if (/groom/i.test(s)) return 'Groom side';
  if (/bride/i.test(s)) return 'Bride side';
  return s;
}

function buildGuestLetter_(data) {
  const name = String(data.name || '').trim() || 'Your guest';
  const side = sideSignOff_(data.side);
  const isYes = data.attending === 'Yes';
  const count = parseInt(data.guests, 10);
  const note = String(data.note || '').trim();

  const lines = ['Hi Nishant & Nishita,', ''];

  if (isYes) {
    if (count > 1) {
      lines.push('I will be attending along with ' + count + ' guests.');
    } else {
      lines.push('I cannot wait to celebrate with you both!');
    }
  } else {
    lines.push('I am so sorry I will not be able to make it.');
    lines.push('I will be thinking of you both on your day and wishing you every happiness.');
  }

  if (note) {
    lines.push('');
    lines.push(note);
  }

  lines.push('');
  lines.push('With love,');
  lines.push(name);
  if (side) lines.push(side);

  return { name: name, side: side, lines: lines, note: note };
}

function formatRsvpEmail_(data) {
  const letter = buildGuestLetter_(data);
  const sideForSubject = letter.side || 'Guest';
  const subject = '[RSVP] Nishant and Nishita Engagement Oct 2026 - ' + letter.name + ' - ' + sideForSubject;
  const body = letter.lines.join('\n');

  const htmlParts = letter.lines.map(function(line, i) {
    if (line === '') return '<p style="margin:0 0 12px;">&nbsp;</p>';
    if (i === 0) {
      return '<p style="margin:0 0 16px;">' + escapeHtml_(line) + '</p>';
    }
    if (line === 'With love,') {
      return '<p style="margin:20px 0 4px;">' + escapeHtml_(line) + '</p>';
    }
    if (line === letter.name || line === letter.side) {
      return '<p style="margin:0;' + (line === letter.name ? 'font-weight:600;' : 'color:#6b3a2a;') + '">' + escapeHtml_(line) + '</p>';
    }
    if (letter.note && line === letter.note) {
      return '<p style="margin:0 0 14px;padding:14px 16px;background:#faf3e6;border-left:3px solid #9b6e32;">' + escapeHtml_(line) + '</p>';
    }
    return '<p style="margin:0 0 14px;">' + escapeHtml_(line) + '</p>';
  });

  const htmlBody = [
    '<div style="font-family:Georgia,\'Times New Roman\',serif;color:#2c1508;line-height:1.65;max-width:520px;">',
    htmlParts.join(''),
    '</div>',
  ].join('');

  return { subject: subject, body: body, htmlBody: htmlBody };
}

function escapeHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendRsvpAlert_(data) {
  const recipients = notifyRecipients_();
  if (!recipients.length) {
    logMail_('ERROR', '', 'No NOTIFY_EMAILS configured');
    return { ok: false, error: 'No recipients' };
  }

  const mail = formatRsvpEmail_(data);
  const sender = Session.getEffectiveUser().getEmail() || 'NishKiNishaani';
  let sent = 0;
  const errors = [];

  recipients.forEach(function(email) {
    try {
      GmailApp.sendEmail(email, mail.subject, mail.body, {
        name: 'NishKiNishaani',
        htmlBody: mail.htmlBody,
        replyTo: sender,
      });
      logMail_('SENT', email, mail.subject);
      sent += 1;
    } catch (err) {
      const msg = String(err);
      errors.push(email + ': ' + msg);
      logMail_('FAILED', email, msg);
    }
  });

  if (sent === 0) {
    return { ok: false, error: errors.join(' | ') };
  }
  if (errors.length) {
    return { ok: true, partial: true, error: errors.join(' | ') };
  }
  return { ok: true };
}

function doPost(e) {
  var mailResult = { ok: false, skipped: true };

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    const lastCol = Math.max(sheet.getLastColumn(), 6);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    let row;
    const mapped = headers.some(function(h) {
      const k = headerKey_(h);
      return k === 'name' || k === 'side' || k === 'attending' || k === 'timestamp';
    });

    if (mapped) {
      row = headers.map(function(h) {
        return valueForHeader_(headerKey_(h), data);
      });
    } else {
      row = [
        data.ts || new Date().toISOString(),
        data.name || '',
        data.side || '',
        data.attending || '',
        data.guests || '',
        data.note || '',
      ];
    }

    sheet.appendRow(row);

    try {
      mailResult = sendRsvpAlert_(data);
    } catch (mailErr) {
      mailResult = { ok: false, error: String(mailErr) };
      logMail_('FAILED', '', String(mailErr));
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, mail: mailResult }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/** Open the Web app URL in a browser — should say "live". */
function doGet() {
  return ContentService.createTextOutput('NishKiNishaani RSVP endpoint is live.');
}

/**
 * Run once from the Apps Script editor (Run → testRsvpEmail).
 * Accept permissions when prompted — required before web emails work.
 */
function testRsvpEmail() {
  const result = sendRsvpAlert_({
    ts: new Date().toISOString(),
    name: 'Test Guest',
    side: 'Groom side',
    attending: 'Yes',
    guests: '2',
    note: 'This is a test alert from Apps Script.',
  });
  Logger.log(JSON.stringify(result));
  if (!result.ok) {
    throw new Error(result.error || 'Test email failed');
  }
}
