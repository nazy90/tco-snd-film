# T&Co SND Film — Crew & Guest Registration

نماذج تسجيل طاقم وضيوف مشروع T&Co SND Film.

| Page | Purpose |
|---|---|
| `index.html` | Crew form |
| `guests/index.html` | Guest form |
| `assets/form.css` | Styling shared by both |
| `assets/form.js` | Logic shared by both |
| `apps-script.js` | Backend — lives in the spreadsheet, not on this site |

## How it works

Both pages load the same `form.js`. Each declares which form it is via
`<body data-form-type="crew">` or `"guest"`, and that value is sent with the
submission so the Apps Script routes the row to the right tab.

One shared script means a fix applies to both forms at once.

**Spreadsheet:** https://docs.google.com/spreadsheets/d/1iLCyoPmXz_rD5HrANistADGOgxBuV1ST-wQ1ADNgM0c/edit
**Documents folder:** https://drive.google.com/drive/folders/1sDloXSyMH0if9sFWN7dLpuQfBYTYS_n4

## Setup (once)

1. Open the spreadsheet → **Extensions → Apps Script**
2. Paste all of `apps-script.js`, save
3. Run `setupTabs` once to create the `Crew` and `Guests` tabs (optional)
4. **Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone**
5. Approve the Google Drive permission prompt
6. Copy the `/exec` URL into `SHEET_WEB_APP_URL` at the top of `assets/form.js`

## Updating the script later

**Deploy → Manage deployments → ✏️ → Version: New version → Deploy**

Choosing *New deployment* instead creates a different URL and the forms keep
posting to the old one.
