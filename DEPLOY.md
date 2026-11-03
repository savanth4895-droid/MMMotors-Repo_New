# MM Motors — Deployment Guide

## Stack
- Frontend → Vercel
- Backend  → Render
- Database → MongoDB Atlas

---

## Step 1 — Generate a secure JWT secret key

Run this once locally and save the output:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```
You will need this in Step 3.

---

## Step 2 — Push to GitHub

```bash
git init
git add .
git commit -m "MM Motors v2.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mmmotors.git
git push -u origin main
```

---

## Step 3 — Backend on Render

1. Go to https://render.com → New → Web Service → connect GitHub repo
2. Settings:
   - **Runtime**: Python 3
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn server:app --host 0.0.0.0 --port 10000`
3. Add **Environment Variables**:

| Key               | Value                                      |
|-------------------|--------------------------------------------|
| `MONGO_URL`       | Your MongoDB Atlas connection string       |
| `DB_NAME`         | `mmmotors`                                 |
| `JWT_SECRET_KEY`  | The hex string you generated in Step 1     |
| `ALLOW_ORIGINS`   | Your Vercel URL (add after Step 4)         |

> ⚠️ `JWT_SECRET_KEY` is **required**. The server will refuse to start without it.

4. Deploy → note your Render URL (e.g. `https://mmmotors-api.onrender.com`)

---

## Step 4 — Frontend on Vercel

1. Go to https://vercel.com → New Project → import GitHub repo
2. Settings:
   - **Framework**: Vite (auto-detected)
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
3. Add **Environment Variable**:

| Key            | Value                                     |
|----------------|-------------------------------------------|
| `VITE_API_URL` | Your Render URL (no trailing slash)       |

4. Deploy → note your Vercel URL (e.g. `https://mmmotors.vercel.app`)

---

## Step 5 — Lock CORS

Back in Render → your service → Environment → update:

| Key              | Value                              |
|------------------|------------------------------------|
| `ALLOW_ORIGINS`  | `https://mmmotors.vercel.app`      |

For both local dev and prod:
```
https://mmmotors.vercel.app,http://localhost:5173
```

Save → Render redeploys (~2 min).

---

## Step 6 — Keep Render alive (free tier)

Render free tier sleeps after 15 min of inactivity.

Fix with UptimeRobot (free):
1. https://uptimerobot.com → New Monitor
2. Type: HTTP(s) · URL: `https://YOUR-RENDER-URL/ready` · Interval: 14 min

Point it at `/ready`, not `/health`. `/ready` pings MongoDB and returns 503 when the
database is unreachable, so the monitor also warns you about a database outage.
`/health` is static and returns 200 even with the database down.

---

## Step 7 — Change default password immediately

On first boot of an empty database the server creates one owner account:
- Username: `owner`
- Password: the value of `OWNER_INITIAL_PASSWORD` if you set it, otherwise a random one-time password printed once in the Render logs (`one-time password=...`)

**Change it immediately after first login:**
1. Go to **Staff** → click your owner profile → **Security** tab
2. Set a strong password (8 characters or more)

New staff accounts get their own one-time password, shown once to the owner when the account is added or imported.

> Upgrading an existing install: the old default password `mm@123456` is still set on any account that never changed it. Change the `owner` password and every staff password that still uses it.

---

## Step 8 — Google Sheet sync (optional)

Mirrors every sale into the shop's existing "M M Motors Sales" spreadsheet. Leave the
two environment variables unset and the app simply does not do it — nothing else changes.

### First, check who can see the sheet

The spreadsheet holds customer names, mobile numbers and home addresses. Open
**Share → General access** and set it to **Restricted**, then add the specific people
who need it. Anyone holding a "anyone with the link" URL can download the lot without
signing in. The sync below keeps working on a restricted sheet, because the script runs
as you.

### 1. Add the script

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Delete whatever is in `Code.gs` and paste the contents of
   [`google-sheet-sync.gs`](google-sheet-sync.gs) from this repo.
3. Generate a long random password and put it in `SHARED_SECRET` at the top:
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(24))"
   ```
4. Check `SHEET_GID` matches the tab you want. It is the `gid=` number in the sheet's
   URL when that tab is open. Default: `30546625`.
5. Save.

### 2. Deploy it

1. **Deploy → New deployment → Select type → Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
3. **Deploy**, approve the permission prompt, and copy the **Web app URL** — it ends
   in `/exec`.

"Anyone" means anyone who knows that URL can write to the sheet, which is why the
script also checks `SHARED_SECRET`. Treat the URL as a password: Render only, never in
a message or a commit.

### 3. Tell the backend

In Render → Environment:

| Key | Value |
|-----|-------|
| `SHEETS_WEBHOOK_URL` | the `/exec` URL from step 2 |
| `SHEETS_WEBHOOK_SECRET` | the same string as `SHARED_SECRET` |

Save, and Render redeploys.

### 4. Check it

Record a test sale. A new row should appear at the bottom of the sheet within a few
seconds. Then edit that sale's colour in the app — the same row should change rather
than a second row appearing. Delete the test sale and the row should disappear.

If a sale does not reach the sheet, the app says so and puts a red **⟳** next to the
invoice number on the Sales list, with the error on hover. Click it to retry. A
**"⟳ Not in sheet (n)"** chip appears in the toolbar while any sale is unsynced.

### Things worth knowing

- **Rows are matched on chassis number** (column K), the only unique value the sheet
  has — it has no invoice-number column. A sale with a blank chassis is always appended
  and never matched afterwards.
- **The app fills only the columns it owns.** Columns **A** (brand/salesperson),
  **O** (RTO Done) and **R** (Page Number) are left for you, as are the unused
  insurance, EMI, LAN and UTR columns.
- **Stop entering new sales in the sheet by hand**, or you will get two rows for one
  bike. Rows already in the sheet are left alone; only app sales are written.
- **Deleting a sale deletes the whole row**, which shifts every row below it up. If any
  other tab refers to this one by row number, change `sheet.deleteRow(found)` in the
  script to clear the cells instead.
- **Changing the script means redeploying.** Use **Deploy → Manage deployments → Edit →
  Version: New version**, or the URL keeps serving the old code.

---

## Environment variables reference

### Frontend (Vercel)
| Variable       | Value               |
|----------------|---------------------|
| `VITE_API_URL` | Your Render URL     |

### Backend (Render)
| Variable          | Value                              | Required |
|-------------------|------------------------------------|----------|
| `MONGO_URL`       | MongoDB Atlas connection string    | ✓        |
| `DB_NAME`         | `mmmotors`                         | ✓        |
| `JWT_SECRET_KEY`  | 64-char hex (generate in Step 1)   | ✓        |
| `ALLOW_ORIGINS`   | Your Vercel URL (never `*`; unset allows only localhost:5173) | ✓        |
| `OWNER_INITIAL_PASSWORD` | First owner password on an empty database | optional |
| `SHEETS_WEBHOOK_URL` | Apps Script web app URL, ends in `/exec` (Step 8) | optional |
| `SHEETS_WEBHOOK_SECRET` | Same string as `SHARED_SECRET` in the script | optional |

---

## Testing a release on staging

### Deploy the backend first

The frontend sends new fields that an old backend silently drops. In particular the
priority star would appear to work and change nothing, because Pydantic discards a
field the model does not declare and still returns 200. Backend, then frontend.

### 1. Run the tests

```bash
pip install pytest
TEST_MONGO_URL="<throwaway-atlas-url>" pytest tests/
```

Expect **28 passed, 1 xfailed**. The xfailed one is the known CGST/SGST paisa rounding,
waiting on the CA. Without `TEST_MONGO_URL` you get 28 passed, 1 skipped — the skipped
test is the one that covers transactions, so run it with a URL before trusting a release.

It creates and drops a database called `mmmotors_test`, so staging data is safe. The URL
must be a replica set (Atlas is one; a plain local `mongod` is not) or the transaction
tests fail.

### 2. Check the Render log on first boot

- `WARNING: duplicate parts_bills.bill_number values` means old duplicate bill numbers
  exist and the unique index could not be created. Find and renumber them.
- Confirm the health check is hitting `/ready` and passing.

### 3. Priority parts and low-stock alerts

| Check | Expected |
|---|---|
| Star a part in the Parts table | Star fills, toast confirms, survives a reload |
| Star a part whose reorder level is 0 | Level becomes 5 automatically |
| Priority filter chip | Shows only starred parts |
| Sidebar | Parts link shows a count badge when a starred part is low |
| Bill a starred part down to its reorder level | Alert names the part, stays until dismissed |
| Bill it again | **No** second alert |
| Bill a starred part down to zero | Alert appears, even though it was already low |
| Bill a non-starred part down to zero | No alert at all |
| Order list | Two sections, priority first, zero-stock parts present |
| Mark ordered | Row shows "Ordered <date>", **reorder level unchanged** |
| Add stock (±Adj or a purchase bill) | The "Ordered" mark disappears |
| Suggest priority parts | Lists real fast movers from bills; Add stars one |
| Print order list | Priority parts first, starred rows marked ★ |

The two that matter most: "Bill it again" is the whole anti-noise design, and
"Mark ordered" is the bug that made the old order list untrustworthy.

### 4. Sale fittings

Set up first: Parts → Edit on a tank cover → **Standard fitting** → tick a brand you
have a bike in stock for, set how many per bike. Repeat for a second accessory and
leave that one at **zero stock** so you can test the shortage path.

| Check | Expected |
|---|---|
| New Sale, pick a bike of that brand | Fittings step is pre-filled with the brand's set |
| Save **without** opening the Fittings step | Fittings still recorded, stock still deducted |
| Stock after saving | Down by the fitted quantity, never below zero |
| Stock log on the part | Entry carries the invoice number |
| The out-of-stock accessory | Sale still saves; toast says it went out without it |
| Sales table | **⚠** next to that invoice number; hover lists what is missing |
| Toolbar | "⚠ Fitting pending (n)" chip filters to those bikes |
| Add stock, then click the ⚠ | Confirms, deducts the stock, marker clears |
| Mark a fitting Free | Price shows FREE, stock **still** comes off |
| Edit the sale, remove a fitting | That stock goes back |
| Delete the sale | All fitting stock returns, vehicle back to In stock |
| Print the invoice | "Fittings supplied with this vehicle" block below the total |
| Sale total | Unchanged by fittings — still what was typed in step 4 |
| A brand with no set | Fittings step starts empty, rows can be added by hand |

### 5. Google Sheet sync

Only if Step 8 is set up on staging. Point it at a **copy** of the spreadsheet, not the
live one, or your test sales end up in the real records.

| Check | Expected |
|---|---|
| Record a sale | New row at the bottom within a few seconds |
| Columns A, O, R | Still blank — the app must not touch them |
| Date format | `3-Nov-2026`, matching the existing rows |
| Edit the sale's colour | Same row changes; no second row appears |
| Delete the sale | Row disappears |
| Wrong secret in Render | Sale still saves, red ⟳ on the row, error on hover |
| Click the ⟳ after fixing | Row appears, marker clears |

The sixth row is the one that matters: a broken sheet must never stop a sale saving.

### 6. Staff account

Sign in as staff with the Parts and Sales pages allowed. The star, mark-ordered,
suggestions, the fittings step and the ⚠ should all work — they sit under the existing
`parts` and `sales` permission areas.

### Before going live

Accessory stock has never been deducted by sales, so the counts are too high. Do a
physical count of tank covers, seat covers, foot rests and grills and correct them,
or the first alerts will fire on wrong numbers.

---

## Local development

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/mmmotors.git
cd mmmotors

# Backend
pip install -r requirements.txt
export MONGO_URL="your-atlas-url"
export DB_NAME="mmmotors"
export JWT_SECRET_KEY="your-generated-hex"
export ALLOW_ORIGINS="http://localhost:5173"
uvicorn server:app --reload --port 8000

# Frontend (new terminal)
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
# Opens at http://localhost:5173
```
