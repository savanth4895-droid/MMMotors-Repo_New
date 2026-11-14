/**
 * MM Motors — nightly backup to Google Drive
 *
 * Downloads the full backup ZIP (same as Dashboard → Download Backup) from the backend
 * every night and saves it in a Drive folder, keeping the last KEEP_DAYS days.
 * Setup steps are in DEPLOY.md → "Step 9 — Nightly Google Drive backup".
 *
 * Use a NEW Apps Script project (script.google.com → New project), not the sheet-sync one.
 */

// Must match BACKUP_KEY in Render (at least 32 characters). Change it here and there together.
var BACKUP_KEY = 'PUT-THE-SAME-LONG-RANDOM-STRING-HERE';

// Your Render backend URL, no trailing slash.
var API_URL = 'https://YOUR-BACKEND.onrender.com';

// Drive folder the ZIPs go into (created on first run if missing).
var FOLDER_NAME = 'MM Motors Backups';

// How many days of backups to keep. Older ZIPs in the folder go to Drive's trash.
var KEEP_DAYS = 30;

/** Run once by hand after pasting: authorises Drive + network access and adds the nightly trigger. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runBackup').timeBased().everyDays(1).atHour(2).inTimezone('Asia/Kolkata').create();
  runBackup();   // first backup now, so you can see it worked
}

function runBackup() {
  // Wake the server first: Render's free tier sleeps and the first request can be slow.
  try { UrlFetchApp.fetch(API_URL + '/ready', { muteHttpExceptions: true }); } catch (e) {}

  var res, lastErr = '';
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      res = UrlFetchApp.fetch(API_URL + '/api/backup/auto', {
        headers: { 'X-Backup-Key': BACKUP_KEY },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() === 200) break;
      lastErr = 'HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200);
    } catch (e) {
      lastErr = String(e);
    }
    res = null;
    Utilities.sleep(20000);
  }
  // Throwing makes Apps Script email the script owner about the failed run.
  if (!res) throw new Error('MM Motors backup failed: ' + lastErr);

  var name = 'mmmotors_backup_' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HHmm') + '.zip';
  var folder = _folder();
  folder.createFile(res.getBlob().setName(name));
  _prune(folder);
}

function _folder() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function _prune(folder) {
  var cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 3600 * 1000);
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (/^mmmotors_backup_.*\.zip$/.test(f.getName()) && f.getDateCreated() < cutoff) f.setTrashed(true);
  }
}
