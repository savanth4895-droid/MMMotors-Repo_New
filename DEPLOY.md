# MM Motors Frontend — Deployment Guide

## Quick summary
- Frontend → Vercel (free)
- Backend  → Render (already deployed)
- Database → MongoDB Atlas (already connected)

---

## Step 1 — Push to GitHub

Create a new repo on GitHub (e.g. `mmmotors-frontend`), then:

```bash
cd mmmotors
git init
git add .
git commit -m "MM Motors frontend v2.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mmmotors-frontend.git
git push -u origin main
```

---

## Step 2 — Deploy on Vercel

1. Go to https://vercel.com → sign up / log in with GitHub
2. Click **New Project** → import `mmmotors-frontend`
3. Configure:
   - **Framework preset**: Vite  ← auto-detected
   - **Root directory**: `./`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
4. Add **Environment Variable**:
   ```
   VITE_API_URL = https://mmmotors-repo-new.onrender.com
   ```
   ← your actual Render URL, NO trailing slash
5. Click **Deploy**
6. Your app will be live at: `https://mmmotors-frontend.vercel.app`

---

## Step 3 — Lock CORS to your Vercel URL

In **Render dashboard** → your backend service → **Environment**:

| Key | Value |
|-----|-------|
| `ALLOW_ORIGINS` | `https://mmmotors-frontend.vercel.app` |

If you want BOTH localhost (for dev) AND Vercel (for prod):
```
https://mmmotors-frontend.vercel.app,http://localhost:5173
```

Click **Save Changes** → Render redeploys automatically (~2 min).

---

## Step 4 — Keep Render alive (UptimeRobot)

Render free tier spins down after 15 min of inactivity.
First request after sleep takes ~30 seconds.

Fix with UptimeRobot (free):
1. Go to https://uptimerobot.com → sign up
2. **New Monitor**:
   - Type: HTTP(s)
   - URL: `https://mmmotors-repo-new.onrender.com/health`
   - Interval: **14 minutes**
3. Save — it will ping every 14 min, keeping Render awake 24/7

---

## Step 5 — Change default passwords

After first login at your Vercel URL:

1. Go to **Staff** → click your owner profile → **Security** tab
2. Change password from `mm@123456` to something strong
3. Do the same for all staff members

---

## Environment variables reference

### Frontend (set in Vercel)
| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Render backend URL |

### Backend (set in Render)
| Variable | Value |
|---|---|
| `MONGO_URL` | Your MongoDB Atlas connection string |
| `DB_NAME` | `mmmotors` |
| `JWT_SECRET_KEY` | Random 64-char hex string |
| `ALLOW_ORIGINS` | Your Vercel URL (comma-separated for multiple) |

---

## Custom domain (optional)

In Vercel → your project → **Settings → Domains**:
- Add `app.mmmotors.in` or `mmmotors.in`
- Add the CNAME record at your DNS provider pointing to `cname.vercel-dns.com`
- Update `ALLOW_ORIGINS` in Render to your custom domain

---

## Local development

```bash
cd mmmotors
cp .env.example .env
# Edit .env — set VITE_API_URL to your Render backend URL
npm install
npm run dev
# Opens at http://localhost:5173
```
