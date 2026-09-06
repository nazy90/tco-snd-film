/**
 * T&Co SND Film — crew + guest registration backend.
 *
 * One deployment serves BOTH forms. The form sends `form_type` ("crew" or
 * "guest") and this routes the row to the matching tab. Attachments go to a
 * single Drive folder shared by both.
 *
 * Paste into the spreadsheet's Apps Script editor, then:
 *   Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone
 * On later edits use: Deploy > Manage deployments > edit > New version > Deploy
 * (that keeps the same URL — creating a NEW deployment changes it).
 */

// https://docs.google.com/spreadsheets/d/1iLCyoPmXz_rD5HrANistADGOgxBuV1ST-wQ1ADNgM0c/edit
const SPREADSHEET_ID = '1iLCyoPmXz_rD5HrANistADGOgxBuV1ST-wQ1ADNgM0c';

// https://drive.google.com/drive/folders/1sDloXSyMH0if9sFWN7dLpuQfBYTYS_n4
const DRIVE_FOLDER_ID = '1sDloXSyMH0if9sFWN7dLpuQfBYTYS_n4';

const TIMEZONE = 'Asia/Riyadh';

const CREW_HEADERS = [
  'submitted_at', 'full_name', 'department', 'position', 'company', 'mobile',
  'instagram_account', 'nationality', 'document_type', 'document_number',
  'document_file', 'has_car', 'plate_number', 'car_type', 'days',
  'department_head', 'is_head', 'team_count', 'notes',
  'consent_accuracy', 'consent_confidentiality', 'consent_no_photography', 'source'
];

const GUEST_HEADERS = [
  'submitted_at', 'visitor_type', 'full_name', 'mobile', 'email',
  'drink', 'food', 'special_requests', 'source'
];

const FORMS = {
  crew:  {sheetName: 'Crew',   headers: CREW_HEADERS},
  guest: {sheetName: 'Guests', headers: GUEST_HEADERS}
};

// Phone, ID and plate numbers lose meaning if Sheets stores them as numbers —
// "0532414582" would become 532414582.
const TEXT_COLUMNS = ['mobile', 'document_number', 'plate_number', 'instagram_account', 'team_count'];

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const config = FORMS[data.form_type] || FORMS.crew;

    if (data.document_file_data) {
      data.document_file = saveDocument(data, config.sheetName);
    }

    const sheet = getSheet(config.sheetName);
    ensureHeaders(sheet, config.headers);

    // Format the target cells as text BEFORE writing, or leading zeros are lost.
    const row = sheet.getLastRow() + 1;
    applyTextFormats(sheet, row, config.headers);
    sheet.getRange(row, 1, 1, config.headers.length)
         .setValues([config.headers.map(header => data[header] || '')]);

    return json({ok: true, sheet: config.sheetName, file: data.document_file || ''});
  } catch (error) {
    // Surface the failure so the form shows a real error, not a false success.
    return json({ok: false, error: String((error && error.message) || error)});
  }
}

function doGet() {
  return json({ok: true, service: 'T&Co SND Film', time: new Date().toISOString()});
}

function applyTextFormats(sheet, row, headers) {
  TEXT_COLUMNS.forEach(function (name) {
    const index = headers.indexOf(name);
    if (index > -1) sheet.getRange(row, index + 1).setNumberFormat('@');
  });
}

function saveDocument(data, label) {
  const bytes = Utilities.base64Decode(data.document_file_data);
  const mime = data.document_file_type || 'application/octet-stream';
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd_HH-mm-ss');
  const name = [
    label,
    sanitize(data.full_name) || 'unknown',
    sanitize(data.document_number),
    stamp
  ].filter(String).join('_');

  const blob = Utilities.newBlob(bytes, mime, name + extensionFor(data.document_file_name, mime));
  const file = DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);

  // Drive has been observed to occasionally create a 0-byte file while still
  // returning a URL. Without this check the form would report success and the
  // person would walk away believing their ID had been received.
  if (file.getSize() === 0) {
    file.setTrashed(true);
    throw new Error('تعذر رفع المرفق بشكل صحيح. يرجى المحاولة مرة أخرى.');
  }
  return file.getUrl();
}

function extensionFor(fileName, mime) {
  const match = String(fileName || '').match(/\.[a-z0-9]+$/i);
  if (match) return match[0].toLowerCase();
  if (mime.indexOf('pdf') > -1) return '.pdf';
  if (mime.indexOf('png') > -1) return '.png';
  if (mime.indexOf('jpeg') > -1 || mime.indexOf('jpg') > -1) return '.jpg';
  return '';
}

function sanitize(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '-').trim();
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeaders(sheet, headers) {
  const width = Math.max(sheet.getLastColumn(), headers.length);
  const firstRow = sheet.getRange(1, 1, 1, width).getValues()[0];
  const existing = firstRow.filter(String).map(String);

  if (!existing.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  if (existing.join('|') === headers.join('|')) return;

  // The columns changed. Rewriting them is safe while the tab holds nothing but
  // the header row; once there are real submissions, refuse rather than write
  // rows whose values silently land in the wrong columns (or nowhere at all).
  if (sheet.getLastRow() <= 1) {
    sheet.getRange(1, 1, 1, width).clearContent();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  throw new Error(
    'أعمدة التبويب "' + sheet.getName() + '" لا تطابق النموذج الحالي. ' +
    'يرجى إبلاغ مسؤول النموذج (تحتاج الأعمدة إلى تحديث).'
  );
}

/**
 * Run this ONCE from the editor to create both tabs with their headers.
 * Optional — the tabs are also created on the first submission.
 */
function setupTabs() {
  Object.keys(FORMS).forEach(function (key) {
    const config = FORMS[key];
    ensureHeaders(getSheet(config.sheetName), config.headers);
  });
}
