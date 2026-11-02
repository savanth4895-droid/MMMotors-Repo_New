# MM Motors — Frontend

React + Vite frontend for MM Motors dealership management system.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set VITE_API_URL to your Render backend URL
npm run dev
```

## Phase 1 Test Checklist

After `npm run dev` opens at http://localhost:5173:

1. **Login page loads** — see the MM Motors sign-in form
2. **Demo account fills** — click "owner" button, credentials auto-fill
3. **Login works** — clicking Sign in calls the real backend
4. **JWT persists** — refresh the page, you stay logged in
5. **Sidebar** — shows correct nav items for owner role
6. **Dashboard stats** — loads live counts from MongoDB
7. **Sign out** — clears token, returns to login

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL e.g. `https://mmmotors-api.onrender.com` |

## Deploy to Vercel

1. Push this folder to GitHub
2. Import repo on vercel.com
3. Set `VITE_API_URL` environment variable
4. Framework preset: Vite
5. Deploy
