/**
 * NishKiNishaani RSVP → Google Sheet
 *
 * Setup:
 * 1. Create a Google Sheet
 * 2. Row 1 headers exactly:
 *      Timestamp | Name | Attending | Guests | Note
 * 3. Extensions → Apps Script → paste this file → Save
 * 4. Deploy → New deployment → Type: Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 5. Copy the Web app URL into script.js → SHEETS_URL
 *
 * Payload from the site:
 *   { ts, name, attending, guests, note }
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      data.ts || new Date().toISOString(),
      data.name || '',
      data.attending || '',
      data.guests || '',
      data.note || '',
    ]);

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
