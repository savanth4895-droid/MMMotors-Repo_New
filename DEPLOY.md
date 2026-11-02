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
2. Type: HTTP(s) · URL: `https://YOUR-RENDER-URL/health` · Interval: 14 min

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
