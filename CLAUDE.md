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
| `SERVICE_DUE_CUTOFF` |     | YYYY-MM-DD. Default `2026-05-01`. Vehicles sold before excluded from Service Due. |
| `SMTP_HOST`     |          | Default `smtp.gmail.com` |
| `SMTP_PORT`     |          | Default `465` (SSL) |
| `SMTP_USER`     | ✓ (for backup) | Gmail address sending backup |
| `SMTP_PASS`     | ✓ (for backup) | Gmail App Password (myaccount.google.com/apppasswords) — NOT login password |
| `BACKUP_EMAIL_TO` | ✓ (for backup) | Owner email receiving nightly backup |
| `ENABLE_BACKUP_SCHEDULER` |  | `"true"`/`"false"` — disable to skip scheduler startup |
| `B2_KEY_ID`     | ✓ (for backup) | Backblaze B2 Application Key ID |
| `B2_APP_KEY`    | ✓ (for backup) | Backblaze B2 Application Key |
| `B2_BUCKET`     | ✓ (for backup) | Bucket name (e.g. `mmmotors-backups`) |
| `B2_ENDPOINT`   | ✓ (for backup) | S3 endpoint URL (shown on bucket page after creation) |

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
| Debts            | CRUD `/debts`, `/debts/summary`, `POST /debts/{id}/payments`              |
| Expenses         | CRUD `/expenses`, `/expenses/stats/summary`                                |
| Accident Est.    | CRUD `/accident-estimates` (PUT recreates if deleted)                     |
| Backup           | `GET /backup/export` (ZIP of per-entity Excel files, admin only) · `POST /admin/trigger-backup` (manual) · `GET /admin/backup-log` (last 20 attempts) |
| P&L              | `GET /reports/pnl`                                                         |

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
- `spare_parts` — parts inventory (NOT `parts`)
- `parts_sales`
- `parts_bills`
- `debts` + embedded payments
- `expenses`
- `accident_estimates`
- `service_notifications` — service-due contact log
- `login_attempts` — TTL 30 min lockout tracking
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

**Discount on service bills**: `discount` field on `service_bills` collection. Applied post-GST off `grand_total`. Frontend clamps `0..subtotal`. Backend stores both `grand_total` (pre-discount) and `net_total` (post-discount). `amount_in_words` derived from `net_total`. Job's `grand_total` synced to `net_total`.

**Complimentary items (free)**: `complimentary: bool` flag per line item on both `service_bills` and `parts_bills`. When true: `unit_price` stored as 0, `mrp` preserves original price for reporting, `gst_rate`=0, `taxable/cgst/sgst/total` all 0. Stock deducts as normal (log reason `"complimentary"` for parts bills). Frontend: checkbox column in bill row, FREE badge, strike-through MRP. Report endpoint `GET /reports/complimentary?date_from&date_to` — groups across both collections by `part_number`, returns qty, occurrences, `mrp_value` forgone, `total_value`.

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
- Form drafts: `useDraft` hook + `DraftBar` component (`src/hooks/useDraft.jsx`). Auto-save every 3s to localStorage. Manual "Save Draft" button. Restore prompt shows when returning to form. Wired into Sales/Service/PartsBill/AccidentEstimate new-record forms only (skipped for edit modals via `enabled` flag). Draft cleared on successful submit. Keys: `mm_draft_sale`, `mm_draft_service`, `mm_draft_parts_bill`, `mm_draft_accident`. Note: file must be `.jsx` (contains JSX), Vite won't transform `.js`.

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

---

## Known Issues / Notes (audit 07 Jul 2026)

### Backup System (added 07 Jul 2026 · B2 upgrade 07 Jul 2026)

- Nightly at 2 AM IST (20:30 UTC). `AsyncIOScheduler` in-process.
- Primary destination: **Backblaze B2** via S3-compatible API (`boto3`).
- Path format: `backups/YYYY/MM/MMMotors_Backup_YYYY-MM-DD.zip`
- Secondary: email **notification only** (no attachment) via Gmail SMTP — subject shows OK/FAIL + size.
- `_build_backup_zip()` — shared with `/backup/export` endpoint.
- `_upload_backup_to_b2()` — runs boto3 `put_object` in thread pool executor.
- `_email_backup_notification()` — best-effort. Email failure does not fail backup.
- Retention: set B2 bucket **Lifecycle Rule** in Backblaze UI (recommend 30-day auto-delete). Not managed by code.
- `backup_log` collection: TTL 90 days. Stores ts, ok, size, key, destination, error.
- Manual: `POST /admin/trigger-backup` (admin only).
- Log: `GET /admin/backup-log?limit=20`.
- **Risk:** B2 key revoked silently. Email notification catches it on next run.
- **Risk:** Scheduler dies on Render restart until UptimeRobot pings `/health`.
- **Risk:** Email address wrong → no failure alerts. Test with `/admin/trigger-backup` after setup.

- ~~`GET /files/{file_id}` — **no auth**.~~ **FIXED 07 Jul 2026** — added `Depends(verify_token)`. Frontend `FileUpload.jsx` now uses blob-fetch pattern (`filesApi.getFileBlobUrl`) with `URL.createObjectURL` + cleanup on unmount. Legacy `filesApi.getFileUrl` retained but no longer functional anonymously.
- `bcrypt==3.2.2` pinned (works with passlib 1.7.4; do not upgrade to 4.x without testing).
- ~~`datetime.utcnow()` used ~51× — deprecated in Python 3.12+. Migrate to `datetime.now(timezone.utc)` eventually.~~ **FIXED 07 Jul 2026** — added `utcnow()` helper in `database.py` returning naive UTC via `datetime.now(timezone.utc).replace(tzinfo=None)`. All 51 call sites replaced. Naive preserved to keep string-format compatibility with existing DB records. Import added to server.py.
- ~~`require_roles()` — returns checker coroutine; currently unused. Broken if used as `Depends(require_roles("x"))` directly — must call first.~~ **FIXED 07 Jul 2026** — outer made sync. Role comparison normalized via `norm_role()`. Now safe as `Depends(require_roles("owner","staff"))`.
- JWT dual-transport: httpOnly cookie AND localStorage Bearer. localStorage path keeps XSS token-theft surface alive.
- ~~Login lockout counts per-username, not per-IP — attacker can lock out any user (username enumeration + DoS).~~ **FIXED 07 Jul 2026** — lockout keyed on `(username, ip)`. Extracts IP via `X-Forwarded-For` (Render proxy) → `request.client.host` fallback. Compound index added. Distributed attackers still bypass; needs CAPTCHA/WAF for full defense.
- ~~Service-due cutoff hardcoded: `SOLD_SINCE = datetime(2026, 5, 1)` in `/service/due`.~~ **FIXED 07 Jul 2026** — reads `SERVICE_DUE_CUTOFF` env var (YYYY-MM-DD). Falls back to `2026-05-01`. Added to `render.yaml`.
- ~~Service-due loads all sales (20k cap) + aggregates all jobs per request — O(N) each call. Fine at current scale.~~ **FIXED 07 Jul 2026** — 60s in-memory TTL cache keyed by `days` param. HTTP middleware invalidates on any 2xx `POST/PUT/PATCH/DELETE` to `/sales*` or `/service*` paths. Safe for single-worker Render free tier. If scaling to multi-worker, replace with Redis.
- ~~`next_sequence` uses `return_document=True` — should be `ReturnDocument.AFTER` enum; truthy value works but relies on pymongo coercion.~~ **FIXED 07 Jul 2026** — uses `ReturnDocument.AFTER` enum.
- Backup export loads 100k docs per collection into memory — acceptable free-tier scale only.
- CLAUDE.md previously said collection `parts` — actual name `spare_parts`.
