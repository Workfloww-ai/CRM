# AGENTS.md — Leads CRM

Context file for AI coding agents (and future you) working on this project. Place this at the root of the project (the parent folder containing both `leads-crm-frontend` and `leads-crm-backend`).

## What this is

A shared leads/CRM tool for a small sales team (built for a team like Rahul & Priya) to track leads, contact info, status, and follow-ups — replacing a spreadsheet. Built from scratch as a learning project, one small step at a time, with a human in the loop understanding every piece.

## Architecture

```
Browser → Next.js frontend (Vercel) → Supabase Auth (JWT)
                ↓
        FastAPI backend (Railway) → verifies JWT → Supabase Postgres (service role)
```

- Frontend authenticates directly with Supabase Auth, gets a JWT
- Every request to the backend includes that JWT as `Authorization: Bearer <token>`
- Backend verifies the token via `supabase.auth.get_user(token)`, then queries Postgres using the **service role key** (bypasses RLS — authorization logic lives in backend code, not RLS)
- RLS is enabled as defense-in-depth, but the backend is the primary authorization layer

## Repos / folders

- `leads-crm-frontend/` — Next.js (App Router, TypeScript, `src/` layout, Tailwind, Turbopack). Redesigned via an AI-assisted UI pass, then substantially extended: app shell with collapsible `Sidebar` (toggle via header Menu button), `Modal` (reused for both Add Lead and the Lead Detail view — the earlier `SlideOver` component was replaced by `Modal` with `hideHeader`/`maxWidth` props), `Badge` (status pills). Login page (`src/app/page.tsx`) uses `useRouter()` from `next/navigation` to redirect to `/leads` on successful login.
  - **Leads table**: server-side search/filter/sort (not client-side) — per-column filter popovers (name, title/designation, org/company, location, industry) plus a global search box, all debounced 300ms before calling the backend; sortable Name/Company/Status columns (`ArrowUpDown`/`ChevronUp`/`ChevronDown` indicators). Columns: checkbox, Name, Designation, Company, Location, Industry, Status, Next Action (+ due date, red/bold via `isUrgent()` if due within 2 days), Last Contacted (most recent activity, joined from `lead_activities` in the `/leads` response).
  - **Bulk actions**: row checkboxes + "select all", bulk delete button (admin-gated: `profile.role_level >= 1`) shown only when leads are selected.
  - **Lead detail modal**: view mode shows contact info read-only; an "Edit" button switches to an inline edit form (`isEditingContact`/`editForm` state) that PATCHes the full edited object on Save. A separate "Update status & next action" quick-action form (`handleQuickActionSubmit`) sits below, for the common case of just moving a lead's stage without opening full edit mode.
  - **CSV/Excel import**: reads the response as a stream (`res.body.getReader()`), parsing newline-delimited JSON progress events to drive a live progress bar (`importProgress` state), then a final `{type: "complete"}` event populates `importResult` — see backend note below, this must stay in sync with the backend's NDJSON streaming response shape.
  - **Known minor issues (not urgent):** the empty-state "No leads found" table row still has `colSpan={4}`, stale from before the table grew to 9 columns — cosmetic only. The "add a note" form (`handleAddComment`, `commentText` state) is fully wired but currently commented out in the JSX — the backend endpoint works, there's just no visible UI entry point for it yet.
- `leads-crm-backend/` — FastAPI (Python):
  - `main.py` — routes only; delegates actual DB work to `db/queries.py`
  - `db/client.py` — Supabase client setup (service role key)
  - `db/queries.py` — every database query, one function per operation (e.g. `get_all_leads`, `create_lead`, `update_lead`, `get_profile_role`, `create_activity`). Deliberately kept as **one file**, not split per-table — the team decided per-table files added navigation overhead without real benefit at this project's size.
  - `auth/dependencies.py` — `get_current_user` (JWT verification against Supabase)
  - `auth/permissions.py` — `require_admin` (depends on `get_current_user`, then checks `role_level >= 1`, else `403`). Use this instead of `get_current_user` on any admin-only endpoint.
  - `models.py` — Pydantic models (`LeadCreate`, `LeadUpdate`)
  - **Refactor complete:** every endpoint in `main.py` now delegates to `db/queries.py` / `auth/` / `models.py` — no raw `supabase.table()` or `supabase.storage` calls remain inside route functions.

## Environment variables

**Backend** (`leads-crm-backend/.env`, gitignored):
```
SUPABASE_URL=https://jdfjonqnkrwhkoxqcloi.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # secret — backend only, never expose to frontend
```

**Frontend** (`leads-crm-frontend/.env.local`, gitignored):
```
NEXT_PUBLIC_SUPABASE_URL=https://jdfjonqnkrwhkoxqcloi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # safe to expose, RLS + backend still gate access
```

## Running locally

**Backend:**
```bash
cd leads-crm-backend
source venv/bin/activate
python -m uvicorn main:app --reload --port 8000
```
Docs/testing UI: `http://localhost:8000/docs`

**Frontend:**
```bash
cd leads-crm-frontend
npm run dev
```
App: `http://localhost:3000` (leads page at `/leads`)

CORS is currently locked to `http://localhost:3000` in `main.py` — update `allow_origins` when deploying to a real domain.

## Database schema (current state)

```sql
create type lead_status as enum ('New', 'Contacted', 'Follow-up', 'Won', 'Lost');

create table leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  title text,
  org text,
  email text,
  phone text,
  phone_2 text,
  linkedin text,
  location text,
  industry text,
  status lead_status not null default 'New',
  next_action text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role_level smallint not null default 0 check (role_level >= 0),
  created_at timestamptz not null default now()
);
```

**`role_level` convention:** `0 = member`, `1 = admin`. Deliberately a plain numeric column (not a separate `roles` table, not an enum) so new tiers can be added later (e.g. `2 = manager`) without a schema migration — see decision log below.

**Schema note — `first_name`/`last_name`/`phone_2` (migrated from a single `name` field):** originally `leads` had one `name text not null` column; migrated to `first_name` (required) + `last_name` (optional) + added `phone_2`, to match the column structure of LinkedIn CSV exports the team imports from (Sr. No / Company / First Name / Last Name / Title / Email / Phone Number 1 / Phone Number 2 / Profile Url — `Sr. No` and `Company`/`Profile Url` map to `org`/`linkedin`, not new columns). `industry` was added separately afterward as a general-purpose column, not from the LinkedIn format. `REQUIRED_COLUMNS` in `main.py` was updated to match both changes — see below. The frontend combines `first_name` + `last_name` into a single display string via a `fullName(lead)` helper in `leads/page.tsx` — the split is preserved in the database (useful for future personalization, e.g. "Dear {first_name}"), combined only at render time. **If migrating existing data with a similar split**, watch for single-word names: `substring(name from position(' ' in name) + 1)` incorrectly duplicates the whole string into `last_name` when there's no space (since `position()` returns 0, not null, when not found) — fix with `update leads set last_name = null where first_name = last_name`.

**`REQUIRED_COLUMNS`** in `main.py` is the single source of truth for CSV export, CSV import, the CSV template, the Excel template (`.xlsx`, with a dropdown-validated Status column via `openpyxl`), and Excel import — currently `["first_name", "last_name", "title", "org", "email", "phone", "phone_2", "linkedin", "location", "industry", "status", "next_action", "due_date"]`. Keep it in sync with the `leads` table if columns change again — also keep `LeadCreate`/`LeadUpdate` in `models.py` in sync, since Pydantic silently drops any field not declared on the model.

**Also built (Phase 2/3):** `lead_activities` (audit log — see below), `attachments` (tracks files stored in the `lead-attachments` Storage bucket: `lead_id`, `file_name`, `storage_path`, `uploaded_by`).

**Not yet built:** `tags`.

## RLS policies (current state)

`leads`: any authenticated user can select/insert/update. Delete is **not** currently restricted at the RLS layer — the admin-only check lives in the FastAPI endpoint instead (see below).

`profiles`: any authenticated user can select. No insert/update policy (rows are only created via the trigger, using `security definer`).

## Backend endpoints (current state)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | none | health check |
| GET | `/leads` | any logged-in user | paginated + **server-side search/filter/sort**: `?page=&page_size=&search=&name=&org=&title=&location=&industry=&sort_by=&sort_dir=`. `search` matches across first_name/last_name/org/title/location/industry (OR'd `ilike`); individual filter params AND together with search and each other. `sort_by` accepts `name`\|`org`\|`status` (mapped to `first_name`/`org`/`status`); anything else (including omitted) defaults to **`due_date` ascending** — a deliberate change from the earlier `created_at desc` default. Returns `{leads, total, page, page_size}`; each lead includes its single most recent `lead_activities` row (joined, powers the "Last Contacted" column). |
| POST | `/leads` | any logged-in user | body: `LeadCreate`; logs `created` activity |
| PATCH | `/leads/{id}` | any logged-in user | body: `LeadUpdate`, partial (`exclude_unset=True`); logs `status_change` activity if status changed. Used for both full inline-edit saves and the quick status/next_action/due_date form. |
| DELETE | `/leads/{id}` | **admin only** (`Depends(require_admin)`) | `403` if `role_level < 1`. Frontend bulk-delete calls this in a loop (`Promise.all`) — no dedicated bulk-delete endpoint exists server-side. |
| GET | `/me` | any logged-in user | returns caller's profile row |
| GET | `/leads/{id}/activities` | any logged-in user | joined with `profiles(full_name)`, newest first |
| POST | `/leads/{id}/notes` | any logged-in user | body: `NoteCreate` (`content: str`); logs a `note` activity. Backend works; frontend UI to add a note is currently commented out. |
| GET | `/leads/export` | any logged-in user | streams all leads as CSV |
| GET | `/leads/import-template` | any logged-in user | streams a blank CSV with correct headers |
| GET | `/leads/import-template-xlsx` | any logged-in user | streams a blank `.xlsx` with a dropdown-validated Status column (`openpyxl`) |
| POST | `/leads/import` | any logged-in user | accepts `.csv` or `.xlsx`, and **auto-detects two formats**: (1) exact match to the app's own template (`REQUIRED_COLUMNS`), or (2) a raw LinkedIn export (columns: First Name, Last Name, Title, Company, Email, Phone Number 1, Phone Number 2, Profile Url — mapped via `LINKEDIN_COLUMN_MAP`; status auto-defaults to `New` since LinkedIn exports don't have one). Anything matching neither format is rejected with a clear error. Per-row validation still applies either way (missing first_name / invalid status → row rejected). **Response is streamed as NDJSON** (`StreamingResponse`, `media_type="application/x-ndjson"`) — one `{"type":"progress",...}` line per row, then a final `{"type":"complete","imported_count","errors"}` line. The frontend must read this via `res.body.getReader()`, not `res.json()`, to stay in sync with this shape. |
| POST | `/leads/{id}/attachments` | any logged-in user | uploads to Storage bucket `lead-attachments`, tracks in `attachments` table, logs a `note` activity |
| GET | `/leads/{id}/attachments` | any logged-in user | joined with `profiles(full_name)` |
| GET | `/attachments/{id}/download` | any logged-in user | returns a 60-second signed URL (bucket is private) |
| DELETE | `/attachments/{id}` | any logged-in user | removes from both Storage and the `attachments` table |

## Key decisions & rationale

- **Authorization lives in the backend, not RLS.** RLS policies are intentionally permissive (any authenticated user) so all the real permission logic (like admin-only delete) is written once, in Python, instead of duplicated across RLS + frontend + backend.
- **`role_level` as a plain smallint, not a `roles` table or enum.** Chosen deliberately for a 2-3 person team with a small, evolving set of roles — trades self-documentation (a raw `2` in the DB doesn't explain itself) for simplicity (no joins, no migrations to add a tier). Revisit if the team/role complexity grows significantly.
- **Backend uses the service role key, always.** The backend is the trusted layer; it verifies the JWT itself rather than relying purely on RLS, then uses the service role key to bypass RLS for legitimate operations it has already authorized.
- **Frontend never touches the service role key.** Only `NEXT_PUBLIC_*` (anon key) in the frontend env — service role stays backend-only.
- **`db/queries.py` is one file, not split per-table.** Considered `db/leads.py`, `db/activities.py`, etc. separately — decided against it for this project's size; one file with clearly-named functions (`get_all_leads`, `create_lead`, etc.) is easier to scan than hopping between many small files. Revisit only if this file grows unwieldy (100+ functions).
- **`first_name`/`last_name` split, not a single `name` field.** See schema note above — driven by needing to match an external CSV format (LinkedIn exports), and split names are more useful for future personalization anyway.
- **Import auto-detects format (app template vs. LinkedIn export) rather than requiring manual reformatting.** `LINKEDIN_COLUMN_MAP` in `main.py` maps LinkedIn's raw column names to internal ones. If a new external source needs importing regularly (e.g. a different tool's export), add another `_COLUMN_MAP` + a branch in `import_leads`'s format-detection `if/elif` — don't force users to manually reformat files that follow a consistent, recognizable structure.
- **No dedicated bulk-delete endpoint.** The frontend's bulk delete fires one `DELETE /leads/{id}` per selected lead via `Promise.all`. Fine at current team/data scale; if bulk operations grow (e.g. bulk status change too), consider a real `POST /leads/bulk-delete` accepting a list of IDs, to cut N requests down to one.
- **Default lead sort is `due_date` ascending, not `created_at` descending.** Changed during the search/filter/sort build-out — leads with the soonest due date surface first when no column is explicitly sorted. Intentional for a follow-up-driven workflow; flag here in case it ever looks like a bug to someone expecting newest-first.

## Testing habit — never bypass auth to test

When debugging a new endpoint, get a real token via the browser console rather than temporarily removing the `Depends(get_current_user)` / `Depends(require_admin)` check to make curl easier. A commented-out or accidentally-committed auth bypass is a real, if narrow, security risk — and getting a fresh token takes seconds:
```js
copy(JSON.parse(localStorage.getItem('sb-jdfjonqnkrwhkoxqcloi-auth-token')).access_token)
```
then in terminal: `TOKEN="paste_here"`, then `curl ... -H "Authorization: Bearer $TOKEN"`. If auth is ever temporarily bypassed for a test, always verify it's reverted with an unauthenticated request before moving on (should return `401`, not data).

## Conventions

- New backend endpoints: use `Depends(get_current_user)` for anything requiring login, or `Depends(require_admin)` (from `auth/permissions.py`) for anything admin-only — don't re-inline a role_level check in the endpoint itself.
- Partial updates use Pydantic models with all-`Optional` fields + `.model_dump(exclude_unset=True)` — never send a full object on PATCH, or unset fields will be wiped to null.
- Frontend: token is fetched fresh per-request via `supabase.auth.getSession()`, not stored in component state — avoids stale-token bugs.

## Status / roadmap

- ✅ Phase 0 — Auth, database, backend/frontend connected
- ✅ Phase 1 — Full leads CRUD (create, read, update status, delete, search)
- ✅ Phase 2 — Team & roles (`profiles`, `role_level`, admin-only delete, full activity log + timeline UI)
- ✅ Phase 3 — CSV export/import (dual-format: app template + LinkedIn auto-detect, both `.csv` and `.xlsx`, streamed with live progress), file attachments (backend + UI), backend architecture refactor (`db/`, `auth/`, `models.py`), **real server-side pagination/search/filter/sort** (per-column filters, debounced search, sortable columns — replaced the earlier client-side-only search), bulk select + bulk delete, inline contact editing, a quick status/next-action/due-date update form, a `notes` activity type (backend done, frontend entry point currently hidden), and a full AI-assisted UI/UX redesign. Minor known issue: stale `colSpan={4}` on the empty-state table row (should be 9).
- ⬜ Phase 4 — Reminders (email/Slack)
- ⬜ Phase 5 — Reporting dashboard
- ⬜ Phase 6 — Tests, CI/CD, monitoring

## For AI agents working on this repo

- This project is being built incrementally by a learning developer — prefer small, explainable changes over large refactors unless asked.
- Don't reintroduce a `role` text column or a separate `roles` table without discussion — `role_level` (numeric) was a deliberate choice, see decision log.
- Leads use `first_name`/`last_name`, not `name` — don't reintroduce a single `name` field. Any UI display should go through a `fullName()`-style combiner, not a raw field.
- Never bypass `Depends(get_current_user)` / `Depends(require_admin)` to test an endpoint — see "Testing habit" section above.
- `POST /leads/import` returns **NDJSON, not a single JSON object** — if touching this endpoint or its frontend caller, preserve the streaming shape (`{"type":"progress",...}` lines + final `{"type":"complete",...}`) or the import progress bar will break.
- `insert_lead` in `db/queries.py` is dead code (exact duplicate of `create_lead`) — safe to delete, not currently referenced anywhere.
- Never commit `.env` / `.env.local` — both are gitignored; if you need new env vars, add them to this file's env var section too.
- The backend currently has no automated tests (Phase 6). If adding tests, use `pytest` per the roadmap.