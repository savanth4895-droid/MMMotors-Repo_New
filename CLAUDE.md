# CLAUDE.md — MM Motors

Motorcycle dealership management system. React + Vite frontend. FastAPI + MongoDB Atlas backend.

---

## Stack

| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | React 19, Vite 8, React Router 7, TanStack Query, Recharts, react-hot-toast |
| Backend  | FastAPI, Uvicorn, Motor (async MongoDB driver)    |
| Database | MongoDB Atlas                                     |
| Auth     | JWT (HS256) via `python-jose`, bcrypt passwords   |
| PDF      | ReportLab (A4, Liberation/DejaVu fonts)           |
| Deploy   | Frontend → Vercel · Backend → Render              |

---

## Project Layout

```
.
├── server.py          # FastAPI app, all route handlers, Pydantic models (~4,470 lines)
├── database.py        # Shared DB state, auth helpers, GST utils, normalizers
├── requirements.txt
├── render.yaml
├── package.json
├── vite.config.js
├── vercel.json        # SPA rewrite → index.html
├── index.html
├── mm_logo.png
├── CLAUDE.md · DEPLOY.md · README.md
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
    ├── main.jsx
    ├── App.jsx           # Routes, AppLayout, QueryClient setup
    ├── index.css
    ├── api/
    │   └── client.js     # Single Axios instance + all API call functions
    ├── context/
    │   └── AuthContext.jsx
    ├── hooks/
    │   ├── useDraft.jsx  # Autosave-to-localStorage form draft hook (must be .jsx)
    │   └── useBadges.jsx # Customer badge types + mobile→badges lookup + <CustomerBadges> chip renderer
    ├── components/
    │   ├── Sidebar.jsx        # Filters NAV by user.allowed_pages
    │   ├── Topbar.jsx
    │   ├── ConfirmModal.jsx   # via ConfirmProvider
    │   ├── ErrorBoundary.jsx  # wraps every route
    │   ├── FileUpload.jsx     # uses filesApi.getFileBlobUrl
    │   └── ui.jsx             # Shared UI primitives
    └── pages/
        ├── LoginPage.jsx
        ├── DashboardPage.jsx
        ├── VehiclesPage.jsx
        ├── SalesPage.jsx           # ~1,073 lines, includes print + PDF path
        ├── ServicePage.jsx         # ~1,602 lines, largest page
        ├── ServiceDuePage.jsx
        ├── PartsPage.jsx           # ~1,511 lines, parts + parts-bill modal
        ├── CustomersPage.jsx
        ├── StaffPage.jsx
        ├── ReportsPage.jsx
        ├── ImportPage.jsx
        ├── DebtPage.jsx
        ├── ExpensesPage.jsx
        ├── VendorsPage.jsx
        ├── PurchaseBillsPage.jsx
        ├── AccidentEstimatePage.jsx
        └── BadgeTypesPage.jsx
```

---

## Architecture

**Two-module backend** — never circular-import:
- `database.py` — config, DB globals, auth, helpers, GST calc, number-to-words. No FastAPI app dependency.
- `server.py` — imports from `database.py`. Owns the FastAPI `app`, all Pydantic models, and both routers.

**Two routers, both mounted directly under `/api`:**
- `api_router = APIRouter(prefix="/api")` — everything (auth, CRUD, reports, dashboard, files, migrations, backup)
- `import_router = APIRouter(prefix="/api/import")` — Excel bulk import

> NOTE: There is **no `/api/v1`** prefix. Frontend calls hit `/api/...` directly.
> `src/api/client.js` sets `baseURL: "${VITE_API_URL}/api"` — do not double-prefix.

**DB globals** (`client`, `db`, `fs`) live in `database.py`, populated by `server.py`'s lifespan on startup. `server.py` keeps module-level `db`/`fs` aliases mirroring `_db.db`/`_db.fs`.

**HTTP middleware:** `_service_due_cache_invalidator` — on any 2xx `POST/PUT/PATCH/DELETE` whose path contains `/sales` or `/service`, clears the in-memory `/service/due` TTL cache.

---

## Environment Variables

### Backend (Render)

| Var             | Required | Notes                                          |
|-----------------|----------|------------------------------------------------|
| `MONGO_URL`     | ✓        | MongoDB Atlas connection string                |
| `DB_NAME`       | ✓        | Default: `mmmotors`                            |
| `JWT_SECRET_KEY`| ✓        | 64-char hex. Server exits on startup without this. |
| `ALLOW_ORIGINS` | ✓        | Comma-separated Vercel URLs + `localhost:5173` |
| `SERVICE_DUE_CUTOFF` |     | YYYY-MM-DD. Default `2026-05-01`. Vehicles sold before excluded from Service Due. |

Generate JWT secret:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Frontend (Vercel)

| Var            | Value                            |
|----------------|----------------------------------|
| `VITE_API_URL` | Render base URL, no trailing slash, no `/api` |

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

# Frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev   # → http://localhost:5173
```

---

## Auth

- JWT stored as `httpOnly` cookie (`mm_token`) **and** localStorage (`mm_token`) — dual transport for cross-origin safety
- `verify_token` accepts either cookie or `Authorization: Bearer` header
- Token expiry: 12 hours
- Max login attempts: 5 per `(username, ip)` · Lockout: 30 min (TTL-collection based)
- Roles: `owner` (admin), `staff`
- Page-level UI gating: `user.allowed_pages` array; `Sidebar.jsx` filters `NAV` by this list
- `require_admin` — owner only
- `require_roles("owner","staff",...)` — role list check (outer sync, inner async — safe as `Depends(require_roles(...))`)

Default seed account (change immediately after first login):
- Username: `owner` · Password: `mm@123456`

> Seed idempotently upserts on every boot to keep `role: owner, status: active`. Deactivating the owner via UI is reverted on next Render restart — intentional footgun-guard.

---

## API Routes

All routes on `api_router` are under `/api`. Import routes under `/api/import`.

| Resource         | Endpoints                                                                 |
|------------------|---------------------------------------------------------------------------|
| Health           | `GET /health`, `GET /ready` (app-level, no prefix)                        |
| Auth             | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`                  |
| Users/Staff      | CRUD `/users`, `/users/{id}/password` (all admin-only)                    |
| Customers        | CRUD `/customers`, `/customers/{id}/timeline`, `PUT /customers/{id}/tags` (admin — replaces badge list), `GET /customer-badges-map` (mobile → [badges] for all customers) |
| Vehicles         | CRUD `/vehicles`, `/vehicles/stats/summary`                               |
| Sales            | CRUD `/sales`, `/sales/stats/summary`, `PATCH /sales/{id}/milestone` (accepts `{key, value, date?}` — date recorded when value=true, cleared when false), `GET /sales/{id}/pdf` |
| Service Jobs     | CRUD `/service`, `/service/due`, `/service/stats`                        |
| Service Due      | `/service/due/{vehicle_number}/notified`, `/service/due/notifications`   |
| Service Bills    | CRUD `/service-bills` (delete admin-only)                                 |
| Parts            | CRUD `/parts`, `/parts/stats/summary`, `/parts/low-stock`, `/parts/out-of-stock`, `/parts/{id}/adjust-stock`, `/parts/{part_number}/adjust-stock-by-number`, `/parts/search-alias` |
| Parts Sales      | CRUD `/parts-sales` **[DEAD — no frontend caller, but endpoints still live and share `part_bill` counter; delete when convenient]** |
| Parts Bills      | CRUD `/parts-bills` (delete admin-only, PUT restores + re-deducts stock)  |
| Vendors          | CRUD `/vendors`, `/vendors/{id}/summary` (delete admin-only)              |
| Purchase Bills   | CRUD `/purchase-bills` (PUT + DELETE admin-only)                          |
| Dashboard        | `GET /dashboard/stats`, `GET /dashboard/recent-activity`                 |
| Reports          | `/reports/revenue`, `/reports/daily-closing`, `/reports/brand-sales`, `/reports/brand-monthly`, `/reports/monthly-counts`, `/reports/top-parts`, `/reports/complimentary`, `/reports/gstr1?month=YYYY-MM`, `/reports/pnl` |
| Files            | `POST /upload`, `GET /files/{file_id}` — both `verify_token`; frontend uses `filesApi.getFileBlobUrl` for authenticated blob fetch |
| Import           | `GET /import/template/{entity}`, `POST /import/preview/{entity}`, `POST /import/{entity}`, `DELETE /import/clear/{entity}` (admin), `GET /import/counts` |
| Migrations       | `POST /migrations/backfill-service-dates`, `/migrations/backfill-delivered-milestones`, `/migrations/backfill-sale-addresses` (all admin) |
| Debts            | CRUD `/debts`, `/debts/summary`, `POST /debts/{id}/payments` (delete admin) |
| Expenses         | CRUD `/expenses`, `/expenses/stats/summary` (delete admin)                 |
| Accident Est.    | CRUD `/accident-estimates` (PUT recreates if deleted)                     |
| Badge Types      | CRUD `/badge-types` (list: all roles, mutations: admin) — customer labels |
| Backup           | `GET /backup/export` — ZIP of per-entity xlsx files, admin only, manual download |

Import supports entities: `customers`, `vehicles`, `sales`, `service`, `parts`, `staff`

---

## MongoDB Collections

- `users` — staff accounts (`allowed_pages` optional array of page IDs)
- `customers`
- `vehicles`
- `sales`
- `service_jobs`
- `service_bills`
- `spare_parts` — parts inventory (has `stock_log[]` sub-doc for audit trail, `aliases[]` for vendor-scoped SKU lookup)
- `parts_sales` — **[DEAD collection, ignore]**
- `parts_bills` — active parts billing (shares `part_bill` counter with `parts_sales`)
- `vendors` — spare-parts suppliers
- `purchase_bills` — one doc per vendor invoice, multi-line
- `debts` + embedded `payments[]`
- `expenses`
- `accident_estimates`
- `service_notifications` — service-due contact log
- `badge_types` — owner-managed customer badges (`name` unique, `color`, `sort_order`); rendered as chips wherever a customer name shows
- `login_attempts` — TTL 30 min lockout tracking, keyed on `(username, ip)`
- `counters` — auto-increment sequences via `next_sequence()`

---

## Key Conventions

### Normalizers
Always call before writing (all in `database.py`):
```python
norm_status("IN STOCK")  # → "in_stock"
norm_role("OWNER")       # → "owner"
norm_type("NEW")         # → "new"
norm_brand("yamaha")     # → "YAMAHA"
```

### Brands
Canonical list in `database.py`:
`HERO, HONDA, BAJAJ, TVS, YAMAHA, SUZUKI, ROYAL ENFIELD, KTM, PIAGGIO, APRILIA, TRIUMPH`

### GST
Rates: `[5, 12, 18]`. Use `calc_gst_line(price, qty, gst_rate, discount=0)` / `calc_bill_totals(items)`.
Prices are always GST-inclusive; taxable back-calculated. Karnataka intra-state → CGST = SGST = tax/2.

### Discounts
- **Per-line** (`item.discount`) — rupee amount off inclusive line total; GST re-split from discounted amount. Complimentary items force discount = 0.
- **Bill-level** (top-level `discount`) — post-GST off `grand_total`. Clamped `0..grand_total`. Stored as `discount`; `net_total = grand_total - discount`; `amount_in_words` from `net_total`.
- Frontend supports ₹/% toggle per input; storage always rupees.

### Complimentary items
`complimentary: bool` flag per line on both `service_bills` and `parts_bills`. When true: `unit_price=0`, `mrp` preserves original, `gst_rate=0`, all tax/total = 0. Stock still deducts (log reason `"complimentary"`). UI shows FREE badge + strike-through MRP. Reported via `GET /reports/complimentary?date_from&date_to`.

### Counters
`next_sequence(name)` uses `ReturnDocument.AFTER`.
Prefixes (`database.py:_PREFIX`):
- `invoice` → `INV-000001`
- `job` → `SRV-000001`
- `part_bill` → `PRT-000001` (shared by parts_sales + parts_bills — parts_sales is dead)
- `part` → `PT-000001`
- `accident_estimate` → `EST-0001`

Service bill numbers **derive from job number** — `SRV-000001` → `SRV-B-000001`. No counter consumed.

### ObjectId helpers
`oid()`, `oids()`, `obj_id()` from `database.py` — `oid()` renames `_id` → `id` and stringifies datetimes to ISO.

### Pagination
`paginate_params` dependency — standard `skip`/`limit`.

### Datetime
Always use `utcnow()` helper from `database.py` — returns naive UTC (`datetime.now(timezone.utc).replace(tzinfo=None)`). Naive preserved for string-format compatibility with existing DB records.

### Numeric input validation
Every numeric field on request models has `Field(ge=..., le=...)` — negative qty/price/discount/stock are rejected at the Pydantic layer, before any DB write. See "Recent hardening" below.

### Regex search
All user-supplied `search` params are wrapped in `re.escape()` before feeding to `{"$regex": ...}`. Users typing `(` / `[` / `*` cannot 500 the server or DoS Atlas via ReDoS.

### Stock decrement
Atomic guarded update:
```python
res = await db.spare_parts.update_one(
    {"_id": part["_id"], "stock": {"$gte": qty}},
    {"$inc": {"stock": -qty}, "$push": {"stock_log": {...}}},
)
if res.matched_count == 0:
    # insufficient stock — no partial write happened
```
No check-then-write TOCTOU race.

### Security
- No `eval` / `exec` / `pickle` / `yaml.unsafe_load`. No `shell=True`. API keys from env vars only.
- No f-strings in DB queries — parameterized only.
- All `$regex` sites escape user input.

---

## Frontend Conventions

- `src/api/client.js` — **the** single Axios instance. All API calls here, nowhere else. `errMsg(e, fallback)` helper unpacks FastAPI validation errors (which come back as arrays of `{loc,msg,...}`).
- TanStack Query: `staleTime: 15_000`, `retry: 1`, refetch on focus/reconnect.
- Auth state in `AuthContext` — wraps entire app. Restores user instantly from `mm_user` in localStorage, then background-validates via `/auth/me`. Network/500 errors don't log out; only true 401 does.
- `ConfirmModal` via `ConfirmProvider` for destructive actions.
- `ErrorBoundary` wraps every route.
- Form drafts: `useDraft` hook + `DraftBar` component (`src/hooks/useDraft.jsx`). Autosave every 3s to localStorage. Manual "Save Draft" button. Restore prompt on return. Wired into Sales/Service/PartsBill/AccidentEstimate **new-record** forms only (skipped for edit modals via `enabled` flag). Draft cleared on successful submit. Keys: `mm_draft_sale`, `mm_draft_service`, `mm_draft_parts_bill`, `mm_draft_accident`.
  - File **must** be `.jsx` (contains JSX) — Vite won't transform `.js`.
- Print bills: `window.open()` + `document.write(html)` pattern in `SalesPage`, `ServicePage`, `PartsPage`, `AccidentEstimatePage`. **All interpolated strings must be HTML-escaped** before injection — customer names / notes are attacker-controlled. [TODO: add `esc()` helper]
- File uploads: `FileUpload.jsx` uses `filesApi.getFileBlobUrl` (authenticated blob fetch + `URL.createObjectURL`); revoke on unmount.

---

## PDF Generation

ReportLab on Render. Fonts registered once at module level via `_register_fonts()`:
- `Sans` / `Sans-Bold` / `Sans-Italic` — Liberation Sans
- `Mono` / `Mono-Bold` — DejaVu Sans Mono

Font path: `/usr/share/fonts/truetype/liberation/` and `/usr/share/fonts/truetype/dejavu/`

Sales invoice: navy/gold theme, two-column grids, amount-in-words, three-column signatures, service schedule table.

---

## Deployment

```
Frontend  →  Vercel     (Vite, output: dist/)
Backend   →  Render     (Python 3.11, free tier, health: /health)
Database  →  MongoDB Atlas M0 free tier
```

Keep Render alive on free tier — UptimeRobot pings `/health` every 14 min.

Python pinned to 3.11 (avoids Python 3.14 pydantic-core build failures).
`bcrypt==3.2.2` pinned (works with passlib 1.7.4 — do **not** upgrade to 4.x without testing).

After deploy:
1. Set `ALLOW_ORIGINS` in Render to Vercel URL.
2. Change default owner password immediately.

---

## Known Issues / Open Items

### Backup
- **Manual only.** `GET /backup/export` (admin) → ZIP of per-entity xlsx.
- `ManualBackupSection` on Dashboard (owner/admin) — "Download Backup" button, blob pattern.
- **Runbook:** owner downloads weekly minimum, stores locally + cloud.
- **Risk:** human forgets → data loss window equals days since last download.
- Old B2 / APScheduler / boto3 / SMTP stripped 08 Jul 2026.

### Access-control gap **[open]**
`allowed_pages` is enforced in `Sidebar.jsx` **only** — backend endpoints check role, not page. A staff user can hit `/api/expenses` or `/api/debts` directly via URL bar or API call and bypass the sidebar filter. Todo: map page → endpoint prefixes and enforce in a dependency.

### Dead `parts_sales` code path **[open]**
Full CRUD endpoints + collection still live in `server.py` (~lines 2340–2400). No frontend caller. Shares `part_bill` counter with `parts_bills`, so `_sync_counter` on `delete_parts_sale` can reset the sequence based on an unwritten collection. Delete the endpoints + collection when convenient.

### Print HTML injection **[open]**
Six `document.write(html)` sites interpolate customer name / notes / part descriptions without escaping. Low exploitability (attacker = own staff), high embarrassment if triggered. Fix: single `esc()` helper wrapped around every `${...}` in print templates.

### Service-bill stock deduction asymmetry **[open]**
`create_service_bill` / `update_service_bill` do **not** decrement `spare_parts.stock` for parts consumed on a service line, but `delete_service_bill` **does** restore stock (`$inc: {stock: qty}`) for every line's `part_number`. Net effect: deleting a bill inflates inventory beyond ground truth. Either add the decrement on create/update or remove the restore on delete — pick one, not both.

### No multi-doc transactions **[open]**
Bill insert + N stock decrements + counter bump = separate operations. Failure mid-loop leaves partial state (stock decremented, bill unwritten). Atlas M0 supports transactions — worth adopting for `create_parts_bill` and `update_parts_bill`.

### Login timing oracle **[minor]**
`not user or not pwd_ctx.verify(...)` — missing user skips bcrypt (~200 ms), enabling username enumeration by timing. Lockout blunts it. Fix: verify against a fixed dummy hash when user is missing.

### Lifespan swallows DB failure **[minor]**
Startup `except Exception: print(WARNING)` then `yield`. `/health` still returns 200 even if `db is None`. UptimeRobot won't notice — every real request 500s. Fix: `/health` should ping DB, or lifespan should raise on DB failure.

### GST Export (GSTR-1)
- `GET /reports/gstr1?month=YYYY-MM` — admin, returns xlsx blob, single sheet `GST`, 34 columns matching CA flat template exactly.
- 3 header rows + column-header row + N data rows + totals row (`=SUM()` formulas, yellow fill).
- Row per bill (no line-item explosion). Service bills → `FormatName = SERVICES BILL, Item = Service`. Vehicle sales → `FormatName = SALES BILL, Item = Showroom Charges/CONSULTATION`.
- 18% GST inclusive back-calc. Karnataka intra-state (CGST=SGST=tax/2, IGST=0).
- **Open**: `customer_gstin` field not yet on sales/service_bills schemas → party GSTIN blank → all rows route B2CL/B2CS not B2B. HSN/SAC mapping table pending CA input. Verify against next CA filing.

---

## Recent Hardening (04 Sep 2026)

**Dashboard KPIs matched only legacy date format.** `dashboard_stats` in `server.py:2803` queried `sale_date == today` where `today = "%d %b %Y"` (e.g. `"04 Sep 2026"`). New sales created via `SalesPage.jsx` send `sale_date` as ISO `YYYY-MM-DD` from `new Date().toISOString().split('T')[0]`; the create endpoint (line 1289) stores the incoming value as-is, so those docs never matched. Reports page worked because it uses `$dateFromString` with `$ifNull` fallback across both formats (line 2861, 2960, 3168) — pattern to emulate elsewhere if needed. Fix: dashboard now builds `today_match = {"sale_date": {"$in": [today_legacy, today_iso]}}` and `month_match = {"$or": [{"$regex": month_legacy}, {"$regex": f"^{month_iso}"}]}`, applied to today count, today revenue, and month revenue.

**Same date-format bug fixed proactively in expenses and P&L.** (1) `expense_stats` (~line 4323) used `$substr: ["$date", 0, 7]` for month key — works for ISO expenses from the form, silently produces garbage buckets like `"04 Sep "` for legacy or Excel-imported records. Now uses the same `$dateFromString` dual-format parse (`%Y-%m-%d` first, then `%d %b %Y`) with `$ifNull`, falling back to `created_at` substr only if both fail. (2) `profit_and_loss.sales_pipe` (~line 4365) parsed only `%d %b %Y`, so ISO-format sales fell through to the `created_at` substr — worked by luck for same-day sales, wrong month for backdated ISO sales. Same fix applied. Dead helper `month_from_sale_date()` at line 4354 left untouched. Dashboard "Net profit (month)" now trustworthy regardless of which format each sale was stored in.

## Recent Hardening (02 Sep 2026)

**Sales — RTO code field added to New Sale form + display fixed.** `SalesPage.jsx` was inconsistent: PDF invoice (`server.py:1148-1155`) grouped RTO with Vehicle No / Chassis / Engine as a text code (e.g. "KA07"), and Excel import (`server.py:3859`) documented it as `RTO office code — stored as text`, but the frontend `SaleView`, WhatsApp copy, and both HTML print templates rendered it as `₹${sale.rto.toLocaleString('en-IN')}` — treating a text code as a rupee amount. Also, no input existed to capture RTO in the New Sale wizard, so the field was permanently blank. Fixes: (1) `rto: ''` added to form initial state (line 538); (2) RTO Code input added to Vehicle tab (step 2, line 718) with `.mono` class, placeholder "e.g. KA01, KA07"; (3) `SaleView` line 437 and Copy line 482 now render `sale.rto || '—'` (no ₹ prefix); (4) RTO removed from `descRows` (price breakdown) in both `printSaleInvoice` and `InvoiceModal.print` — it was never a monetary line; (5) RTO added to Vehicle info section of `printSaleInvoice` HTML template alongside Reg No / Chassis / Engine, matching PDF layout. `InvoiceModal.print` already had RTO in the Registration section — untouched. Backend accepts `rto` as-is via spread; no schema change.

**Service-bill part-name dropdown escapes clipping.** `BillRow` in `ServicePage.jsx` (~line 1256) previously rendered the parts-autocomplete popover with `position:absolute` inside a narrow `<td>`, so long names (e.g. "Shell Advance AX5 Motorcycle Oil 10W30 4T") wrapped and got clipped by modal/table overflow. Now portalled to `document.body` via `createPortal` with `position:fixed`; coords computed from the input's `getBoundingClientRect()`, min width 320px, flips upward when space below < 220px, repositions on scroll/resize. `onFocus` also re-opens the dropdown on an already-filled row so editors can re-pick. Row layout now matches PartsPage parts-search dropdown: two-column flex — left column shows name + `part_number · category`, right column shows price (gold) + stock (green/amber if ≤5). `zIndex:10000` sits above the service-bill modal.

## Recent Hardening (21 Aug 2026)

**Customer badge system.** Owner-managed set of colored labels applied to customers, visible everywhere a customer name appears. New collection `badge_types` (`{name unique, color, sort_order}`) seeded on first boot with six defaults (VIP, Family, Repeat, Referral, Special Offer, Corporate). New routes: `GET /badge-types` (all roles), `POST/PATCH/DELETE /badge-types/{id}` (admin) — PATCH cascades name change across all customers' `tags` arrays via `$set` array filter; DELETE `$pull`s the removed name from every customer. Customer badge assignment lives on a dedicated `PUT /customers/{id}/tags` endpoint (admin), so staff cannot bypass by editing the customer directly — the `tags` field was removed from `CustomerUpdate` for that reason. New lightweight lookup `GET /customer-badges-map` returns `{mobile: [names]}` for the whole customer base, so list pages can render chips without fetching full customer records. Frontend: new `useBadges` hook + reusable `<CustomerBadges>` chip component, new owner-only `/badge-types` settings page with color picker and preview, dynamic picker on `CustomersPage` (replaced hardcoded VIP/Corporate/Loyal), and chips wired into the customer name cell on Sales, Service, Debt, and Accident Estimate list pages. Mobile-based join (client-side, TanStack Query cached, 60 s TTL); no denormalization onto sale/service/debt/estimate docs.

## Recent Hardening (20 Aug 2026)

**Sale milestone completion dates.** Sales list now captures the date each milestone (documents/invoice/insurance/tax_paid/number_plate) was achieved. Clicking an empty milestone button opens a date-picker popup (defaults to today, `max=today`); Save persists both the boolean flag and the date. Unchecking is instant — no popup, date removed. Storage: bool state in existing `sale.milestones`, dates in new sibling dict `sale.milestone_dates` — `{documents: "2026-08-20", ...}`. Backward compatible; legacy sales without the dict render fine, owner can retro-fill via the popup. Backend: `MilestoneUpdate` model gained optional `date` field (YYYY-MM-DD, validated via `re.fullmatch`); `PATCH /sales/{id}/milestone` persists both dicts and returns both; SaleCreate/SaleUpdate accept `milestone_dates` for import/backfill. Frontend: `MilestoneDateModal` in `SalesPage.jsx`; `MilestoneRow` tooltip now shows completion date (`"Done on DD Mon YYYY"`); optimistic mutation updates both dicts; `salesApi.updateMilestone(id, key, value, date)` signature extended. Reports and PDFs do not yet surface milestone dates — separate pass.

**Three critical fixes applied in one patch, all in `server.py`:**

1. **Numeric input validation.** Every numeric field on every request model now has `Field(ge=..., gt=..., le=...)` constraints. 45 field validators across 18 models covering: `qty`, `unit_price`, `gst_rate`, `discount`, `stock`, `reorder_level`, `purchase_price`, `selling_price`, `amount` (debt/expense/payment), `salary`, `labour_charges`. `PaymentCreate.amount` is `gt=0`; other legitimately-zero fields are `ge=0`; percentages are `le=100`. Blocks the negative-qty stock inflation attack — a bill with `qty=-5` no longer refills stock via the delete-restore path.
2. **Regex injection / ReDoS.** All raw `{"$regex": search}` sites (29 fields across 8 list endpoints) replaced with `re.escape(search)` first. Users typing `(` / `[` / `*` in any search box no longer 500 the server; catastrophic-backtracking regexes no longer DoS Atlas M0. `expenses.month` (`YYYY-MM`) now validated with `re.fullmatch` before use.
3. **Atomic stock decrement.** Three sites (`create_parts_sale`, `create_parts_bill`, `update_parts_bill`) rewritten from check-then-write to guarded `update_one({"_id": ..., "stock": {"$gte": qty}}, {"$inc": {"stock": -qty}, "$push": {"stock_log": ...}})`. If `matched_count == 0` → insufficient stock, re-read for accurate error message. Two concurrent bills for the same part can no longer oversell.

CLAUDE.md rewritten same day to reflect actual routing (`/api`, not `/api/v1`), all pages/routes/collections that had drifted, and the four remaining open items above (page ACL, dead parts_sales, print injection, service-bill stock asymmetry).

---

## Earlier Hardening

- **07 Jul 2026** — GridFS auth added (`verify_token` on `/files/{id}`); frontend switched to blob-fetch. `utcnow()` helper replaces `datetime.utcnow()` at 51 sites. `require_roles()` outer made sync + normalized comparison. Login lockout keyed on `(username, ip)` — no more DoS-any-user via username enumeration. Service-due cutoff moved to env var. `/service/due` gained 60s in-memory TTL cache with middleware invalidation. `next_sequence` switched to `ReturnDocument.AFTER` enum.
- **08 Jul 2026** — Discount system unified (per-line + bill-level, ₹/% toggle) across parts_bills + service_bills. Backup system stripped (removed APScheduler, boto3, ten env vars). GSTR-1 export rewritten to CA's 34-column flat template.
- **Deployment fixes** — DNS fix for mmmotors.biz at GoDaddy; `useDraft.js` → `useDraft.jsx` rename for Vite JSX transform; missing `utcnow` import crash on Render.
- **Auth history** — migrated from localStorage JWT → httpOnly cookies → dual-token (both) for cross-origin safety.
- **Accident estimate** — save bugs fixed (missing `"accident_estimate"` in `_PREFIX`, `:04d` type error on pre-formatted string), CORS on PUT for deleted estimates, six-tab page with print.
- **Service due** — rewritten for 30-day first service (sold), 90-day subsequent, 90-day flat for service-only, configurable cutoff.

---
