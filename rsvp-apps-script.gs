/**
 * NishKiNishaani RSVP → Google Sheet
 *
 * Setup:
 * 1. Create a Google Sheet
 * 2. Row 1 headers (order can vary — matched by name):
 *      Timestamp | Name | Side | Attending | Guests | Note
 * 3. Extensions → Apps Script → paste this file → Save
 * 4. Deploy → New deployment → Type: Web app
 *      Execute as: Me
 *      Who has access: Anyone
 *    (If already deployed: Deploy → Manage deployments → ✎ → New version → Deploy)
 * 5. Copy the Web app URL into script.js → SHEETS_URL
 *
 * Payload from the site:
 *   { ts, name, side, attending, guests, note }
 */

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

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    const lastCol = Math.max(sheet.getLastColumn(), 6);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    /* Prefer header names so inserting “Side” anywhere still works.
       Fallback order if the sheet has no recognisable headers yet. */
    let row;
    const mapped = headers.some(h => {
      const k = headerKey_(h);
      return k === 'name' || k === 'side' || k === 'attending' || k === 'timestamp';
    });

    if (mapped) {
      row = headers.map(h => valueForHeader_(headerKey_(h), data));
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

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
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
