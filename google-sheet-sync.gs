/**
 * MM Motors — Google Sheet sync endpoint
 *
 * Paste this into the sales spreadsheet (Extensions → Apps Script), set SHARED_SECRET
 * below, then deploy it as a web app. The backend posts one sale at a time to it.
 * Setup steps are in DEPLOY.md → "Step 8 — Google Sheet sync".
 *
 * Rows are matched on CHASSIS NUMBER (column K), which is unique per bike and the only
 * stable key the sheet has — it has no invoice-number column. A sale whose chassis is
 * blank is always appended, never matched, because every blank would match every other.
 */

// Must match SHEETS_WEBHOOK_SECRET in Render. Change it here and there together.
var SHARED_SECRET = 'PUT-THE-SAME-LONG-RANDOM-STRING-HERE';

// The tab to write to, by its gid (the number in the sheet's URL). Survives renaming.
var SHEET_GID = 30546625;

// Column holding the chassis number, used to find an existing row.
var CHASSIS_COL = 'K';

// First row of data: row 1 is the header.
var FIRST_DATA_ROW = 2;

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Two sales saved at the same moment must not append onto the same row.
  if (!lock.tryLock(30000)) return _json({ ok: false, error: 'busy' });
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SHARED_SECRET) return _json({ ok: false, error: 'bad secret' });

    var sheet = _sheetByGid(SHEET_GID);
    if (!sheet) return _json({ ok: false, error: 'sheet gid ' + SHEET_GID + ' not found' });

    var chassis = String(body.chassis || '').trim();
    var found   = chassis ? _findRow(sheet, chassis) : 0;

    if (body.action === 'delete') {
      if (!found) return _json({ ok: true, action: 'nothing to delete' });
      sheet.deleteRow(found);
      return _json({ ok: true, action: 'deleted', row: found });
    }

    var row = found || sheet.getLastRow() + 1;
    if (!found && row < FIRST_DATA_ROW) row = FIRST_DATA_ROW;

    // body.cells is { "B": value, "C": value, ... } — the backend owns the mapping, so
    // only one place has to change if a column moves.
    var cells = body.cells || {};
    for (var letter in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, letter)) continue;
      var value = cells[letter];
      if (value === null || value === undefined) continue;   // leave that cell alone
      sheet.getRange(letter + row).setValue(value);
    }
    return _json({ ok: true, action: found ? 'updated' : 'appended', row: row });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Reachable in a browser to check the deployment is live. Reveals no data. */
function doGet() {
  return _json({ ok: true, service: 'MM Motors sheet sync' });
}

function _sheetByGid(gid) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

function _findRow(sheet, chassis) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return 0;
  var values = sheet.getRange(CHASSIS_COL + FIRST_DATA_ROW + ':' + CHASSIS_COL + last).getValues();
  var needle = chassis.toUpperCase();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toUpperCase() === needle) return i + FIRST_DATA_ROW;
  }
  return 0;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
