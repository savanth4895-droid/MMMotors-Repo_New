# CLAUDE.md — MM Motors

Motorcycle dealership management system. React + Vite frontend. FastAPI + MongoDB Atlas backend.

---

## Stack

| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | React 19, Vite 8, React Router 7, TanStack Query |
| Backend  | FastAPI, Uvicorn, Motor (async MongoDB driver)    |
| Database | MongoDB Atlas                                     |
| Auth     | JWT (HS256) via `python-jose`, bcrypt passwords   |
| PDF      | ReportLab (A4, Liberation/DejaVu fonts)           |
| Deploy   | Frontend → Vercel · Backend → Render              |

---

## Project Layout

```
.
├── server.py          # FastAPI app, all route handlers, Pydantic models
├── database.py        # Shared DB state, auth helpers, GST utils, normalizers
├── requirements.txt   # Python deps
├── render.yaml        # Render deployment config
├── package.json       # Frontend deps
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx           # Routes, AppLayout, QueryClient setup
    ├── index.css
    ├── api/
    │   └── client.js     # Axios instance + all API call functions
    ├── context/
    │   └── AuthContext.jsx
    ├── components/
    │   ├── Sidebar.jsx
    │   ├── Topbar.jsx
    │   ├── ConfirmModal.jsx
    │   ├── ErrorBoundary.jsx
    │   ├── FileUpload.jsx
    │   └── ui.jsx         # Shared UI primitives
    └── pages/
        ├── LoginPage.jsx
        ├── DashboardPage.jsx
        ├── VehiclesPage.jsx
        ├── SalesPage.jsx
        ├── ServicePage.jsx
        ├── ServiceDuePage.jsx
        ├── PartsPage.jsx
        ├── CustomersPage.jsx
        ├── StaffPage.jsx
        ├── ReportsPage.jsx
        ├── ImportPage.jsx
        ├── DebtPage.jsx
        └── ExpensesPage.jsx
```

---

## Architecture

**Two-module backend** — never circular-import:
- `database.py` — config, DB globals, auth, helpers. No FastAPI app dependency.
- `server.py` — imports from `database.py`. Owns the FastAPI `app` and all routers.

**Three routers mounted at `/api/v1`:**
- `api_router` — core CRUD (customers, vehicles, sales, service, parts, staff, dashboard, reports)
- `import_router` — bulk Excel import at `/api/v1/import/`
- Both include `/upload` and `/files/{file_id}` for GridFS file storage

**DB globals** (`client`, `db`, `fs`) live in `database.py`, populated by `server.py`'s lifespan on startup.

---

## Environment Variables

### Backend (Render)

| Var             | Required | Notes                                          |
|-----------------|----------|------------------------------------------------|
| `MONGO_URL`     | ✓        | MongoDB Atlas connection string                |
| `DB_NAME`       | ✓        | Default: `mmmotors`                            |
| `JWT_SECRET_KEY`| ✓        | 64-char hex. Server exits without this.        |
| `ALLOW_ORIGINS` | ✓        | Comma-separated Vercel URLs + `localhost:5173` |

Generate JWT secret:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Frontend (Vercel)

| Var            | Value                            |
|----------------|----------------------------------|
| `VITE_API_URL` | Render URL, no trailing slash    |

---

## Local Dev

```bash
# Backend
pip install -r requirements.txt
export MONGO_URL="your-atlas-url"
export DB_NAME="mmmotors"
export JWT_SECRET_KEY="your-hex"
export ALLOW_ORIGINS="http://localhost:5173"
uvicorn server:app --reload --port 8000

# Frontend (new terminal)
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev   # → http://localhost:5173
```

---

## Auth

- JWT stored as `httpOnly` cookie (`mm_token`) **or** `Authorization: Bearer` header
- Token expiry: 12 hours
- Max login attempts: 5 · Lockout: 30 min
- Roles: `owner` (admin), `staff`
- `require_admin` — owner only
- `require_roles([...])` — role list check

Default seed account (change immediately after first login):
- Username: `owner` · Password: `mm@123456`

---

## API Routes (all under `/api/v1`)

| Resource         | Endpoints                                                                 |
|------------------|---------------------------------------------------------------------------|
| Auth             | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`                  |
| Users/Staff      | CRUD `/users`, `/users/{id}/password`                                     |
| Customers        | CRUD `/customers`, `/customers/{id}/timeline`                             |
| Vehicles         | CRUD `/vehicles`, `/vehicles/stats/summary`                               |
| Sales            | CRUD `/sales`, `/sales/stats/summary`, `GET /sales/{id}/pdf`             |
| Service Jobs     | CRUD `/service`, `/service/due`, `/service/stats`                        |
| Service Due      | `/service/due/{vehicle_number}/notified`, `/service/due/notifications`   |
| Service Bills    | CRUD `/service-bills`                                                     |
| Parts            | CRUD `/parts`, `/parts/stats/summary`, `/parts/low-stock`, stock adjust  |
| Parts Sales      | CRUD `/parts-sales`                                                       |
| Parts Bills      | CRUD `/parts-bills`                                                       |
| Dashboard        | `GET /dashboard/stats`, `GET /dashboard/recent-activity`                 |
| Reports          | `/reports/revenue`, `/reports/daily-closing`, `/reports/brand-sales`, `/reports/top-parts` |
| Files            | `POST /upload`, `GET /files/{file_id}` (GridFS)                          |
| Import           | `GET /import/template/{entity}`, `POST /import/preview/{entity}`, `POST /import/{entity}` |
| Health           | `GET /health`, `GET /ready`                                               |
| Migrations       | `POST /migrations/backfill-service-dates`, `/migrations/backfill-sale-addresses` |

Import supports: `customers`, `vehicles`, `sales`, `service`, `parts`, `staff`

---

## MongoDB Collections

Derived from server usage:

- `users` — staff accounts
- `customers`
- `vehicles`
- `sales`
- `service_jobs`
- `service_bills`
- `parts`
- `parts_sales`
- `parts_bills`
- `counters` — auto-increment sequences via `next_sequence()`

---

## Key Conventions

**Normalizers** (always call before writing):
```python
norm_status("IN STOCK")  # → "in_stock"
norm_role("OWNER")       # → "owner"
norm_type("NEW")         # → "new"
norm_brand("yamaha")     # → "YAMAHA"
```

**Brands** (canonical list in `database.py`):
`HERO, HONDA, BAJAJ, TVS, YAMAHA, SUZUKI, ROYAL ENFIELD, KTM, PIAGGIO, APRILIA, TRIUMPH`

**GST rates**: `[5, 12, 18]` — use `calc_gst_line()` / `calc_bill_totals()`

**ObjectId helpers**: `oid()`, `oids()`, `obj_id()` from `database.py`

**Pagination**: `paginate_params` dependency — standard `skip`/`limit`

**SQL rule**: No f-strings in queries. Parameterized only. (`?` placeholders in any raw queries)

**Security**: No `eval`/`exec`/`pickle`/`yaml.unsafe_load`. No `shell=True`. API keys from env vars only.

---

## Frontend Conventions

- `src/api/client.js` — single Axios instance. All API calls here, nowhere else.
- TanStack Query: `staleTime: 15_000`, `retry: 1`, refetch on focus/reconnect
- Auth state lives in `AuthContext` — wraps entire app
- `ConfirmModal` via `ConfirmProvider` for destructive actions
- `ErrorBoundary` wraps all routes

---

## PDF Generation

ReportLab on Render. Fonts registered once at module level:
- `Sans` / `Sans-Bold` / `Sans-Italic` — Liberation Sans
- `Mono` / `Mono-Bold` — DejaVu Sans Mono

Font path: `/usr/share/fonts/truetype/liberation/` and `/usr/share/fonts/truetype/dejavu/`

---

## Deployment

```
Frontend  →  Vercel     (Vite, output: dist/)
Backend   →  Render     (Python, free tier, health: /health)
Database  →  MongoDB Atlas
```

Keep Render alive on free tier — UptimeRobot pings `/health` every 14 min.

After deploy:
1. Set `ALLOW_ORIGINS` in Render to Vercel URL
2. Change default owner password immediately
