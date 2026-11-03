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

### 5. Staff account

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
