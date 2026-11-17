# EPM System v2 — Electrical Preventive Maintenance

Self-hosted system for PM records, load balancing, megger (insulation resistance) tests, PM checklists
with Bills of Materials, store lists and site photos/videos. **No Firebase**: users, authentication and all data live in your own
MySQL database behind a Python API. A built-in user manual is available in the app at `/help`.

```
┌──────────────┐  same origin  ┌───────────────────────┐        ┌──────────────┐
│ React SPA    │──────────────▶│ nginx  (web)          │  /api  │ FastAPI      │──▶ MySQL 8
│ (Vite build) │   cookies     │ static files + proxy  │───────▶│ (backend)    │──▶ uploads/ (disk)
└──────────────┘               └───────────────────────┘        └──────────────┘──▶ SMTP (reset + BOM e-mails)
                                         stores ── /api/v1/public/bom/{token} (30-day PDF link, no sign-in)
```

| Layer     | Stack |
|-----------|-------|
| Frontend  | React 19, TypeScript, Vite, Tailwind CSS 4, Motion (Framer Motion), TanStack Query, React Router, Recharts |
| Backend   | Python 3.12+, FastAPI, SQLAlchemy 2, Pydantic 2, Alembic, Argon2id, PyJWT, fpdf2 + Pillow (BOM PDFs) |
| Database  | MySQL 8 (existing `pm_db1` is migrated in place; legacy tables are kept as `legacy_*`) |

---

## What changed (v1 → v2)

### Firebase removed
| v1 (PHP + Firebase) | v2 |
|---|---|
| Firebase Auth sign-in, PHP session fallback | Own auth: e-mail + password, Argon2id hashes |
| Admin = Firebase custom claim `admin` | `users.role` (`admin` / `user`), enforced by the API |
| `reauthenticateWithCredential` before adding records | `POST /auth/verify-password` (same UX) |
| Sign-up authorised by typing another user's password | Admins create users and send invite links |
| Firebase Realtime DB + localStorage copies | MySQL is the only source of truth (drafts of unsaved forms stay in the browser) |
| Firebase SDK + API key on 13 pages | Gone |

### Security fixes
- **Every API endpoint now requires authentication.** In v1 the PHP API was open: anyone who knew the URL could read or delete all records.
- Session = 15-minute JWT in an httpOnly cookie, plus a rotating refresh token (7 days, or 30 with "keep me signed in"). Refresh tokens are stored hashed. If an old token is reused, the whole session is revoked as a stolen-token defence.
- CSRF protection: the CSRF cookie must be echoed back in a header. Cookies are SameSite and Secure in production.
- Logins are rate-limited (app and nginx). An account locks for 15 minutes after 10 failed attempts. Error messages never reveal whether an account exists.
- Password reset: single-use link valid for 45 minutes (configurable 30–60). Only the token's hash is stored, a new link invalidates older ones, and a reset signs out every device.
- Deletes are admin-only **soft deletes** with restore. An audit log records sign-ins, changes and deletions.
- Uploads: file type checked by its actual bytes as well as its extension, a size limit, and files served only to signed-in users. "Deleted by" is taken from the session, not a client header that can be faked.
- No secrets in code. The DB password, JWT key and SMTP credentials all come from `.env`.
- Bugs fixed:
  - Updating a maintenance record (`PUT`) always failed in v1.
  - The full-load test showed `NaN` for delta and split-phase circuits (`Math.SQRT3` doesn't exist in JavaScript).
  - Two equipment options shared the same value.
  - The CSV export left the "performed by" column empty.

### Database schema (Alembic-managed)
- `users`: uuid, e-mail (unique), role, password_hash (empty means "must set a password"), is_active, lockout fields, timestamps.
- `refresh_tokens`, `auth_tokens` (reset/invite) and `audit_log`.
- Record tables use snake_case columns, real `DATE` types (the checklist date used to be text), and `created_by_id` / `updated_by_id` foreign keys plus `deleted_at`:
  - `maintenance_records`
  - `load_balancing_records`
  - `megger_tests` (header fields were lifted out of the JSON blob)
  - `pm_checklists`
  - `store_lists`
- `maintenance_uploads` has a real foreign key to its record (`ON DELETE SET NULL`).
- PM records, load balancing, megger tests and checklists carry `archived_at` / `archived_by_id` / `archive_reason` (migrations 0005–0006).
- Bills of Materials (migration 0007):
  - `boms`: one per checklist, with status `draft`/`final`, revision, store e-mail and CC, and sign-off.
  - `bom_items`: name, part no., quantity, unit, optional unit cost, linked finding and photo.
  - `bom_images`: material photos stored under `uploads/`.
  - `bom_links`: e-mailed download links. Only the SHA-256 hash of each token is stored, with expiry, revocation and a download counter.
- Derived totals (phase totals, kVA, store-list counts) are **recomputed on the server** on every save.
  Delta kVA = (I<sub>L1-L2</sub>·V<sub>L1-L2</sub> + I<sub>L1-L3</sub>·V<sub>L1-L3</sub> + I<sub>L2-L3</sub>·V<sub>L2-L3</sub>) ÷ 1000 (migration 0004 recomputed existing rows).

### Frontend
- Modern UI: dark/light theme, maintenance graphics (animated gears, panel board, meter, checklist), page transitions, animated KPIs, charts and micro-interactions.
- Respects the OS "reduce motion" setting.
- All modules from v1 are ported, with the calculations moved into unit-tested modules:
  - PM records (filters, CSV, print, attachments)
  - Load balancing (phase bars, imbalance, rebalancing suggestions, neutral vector sum, full-load test, CSV import/export)
  - Megger (per-circuit columns, automatic Passed/Failed at < 350 MΩ)
  - PM checklist, store list (automatic brand numbering), performance podium/charts
  - Photo/video gallery with trash
- Every form has a print/PDF view.
- Unsaved new forms autosave as drafts in the browser.

### Added since v2.0
- **Archive** (admin) for PM records, load balancing, megger tests and checklists:
  - Archive one record, a selection, or everything before a date, with an optional reason and a preview count.
  - Archived records are read-only and live in an Archive tab.
  - They are excluded from the dashboard's active and overdue counts, but still count on Performance.
  - Unarchive returns them to the active list.
- **Bill of Materials** for checklists with NOT OK items:
  - Draft → Finalize, which freezes a branded PDF revision and e-mails the store a secure 30-day link.
  - Reopen and re-finalize as revision 2, 3…, Resend for a fresh link, and a per-link download history.
  - Photos per item, and optional costs with an estimated total.
- **User manual** at `/help`: 17 chapters, searchable contents, and a print-ready booklet.
- **Performance** printout includes the Top team / Top technician bar charts.

---

## Running in production (Docker)

```bash
cp .env.example .env        # then edit: SECRET_KEY, DB_PASS, MYSQL_ROOT_PASSWORD, SMTP_*, BOM_SMTP_*, APP_BASE_URL
docker compose up -d --build
docker compose exec backend python -m app.cli create-admin --email you@company.com --name "Your Name"
```
Open `http://<server>:8080` (set `HTTP_PORT` to change it). Put HTTPS in front of it, for example Caddy, Traefik or your host's TLS proxy. Set `ENVIRONMENT=production` so cookies are marked Secure.

On Linux hosts, make the uploads folder writable by the container user: `sudo chown -R 10001:10001 uploads`.
BOM photos and the frozen BOM PDFs are stored there too, under `uploads/bom/`, so include that folder in backups.

`APP_BASE_URL` must be the public HTTPS address. It is used to build the BOM download links e-mailed to stores,
and a `localhost` value produces links that only work on the server itself.

### Database user
If `alembic` / the CLI says *"MySQL rejected the login"*, the `DB_USER` / `DB_PASS` in `.env` don't match an account
on the server at `DB_HOST:DB_PORT`. Connect as root and create (or reset) the application user:

```sql
CREATE DATABASE IF NOT EXISTS pm_db1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'pm_user'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
CREATE USER IF NOT EXISTS 'pm_user'@'127.0.0.1' IDENTIFIED BY 'choose-a-strong-password';
ALTER USER 'pm_user'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
ALTER USER 'pm_user'@'127.0.0.1' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON pm_db1.* TO 'pm_user'@'localhost', 'pm_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```
Then put the same password in `DB_PASS` (wrap it in single quotes if it contains `@`, `#` or `$`).

### Migrating the existing database
The backend runs `alembic upgrade head` on start. On an existing `pm_db1`:

1. **Back up first:** `mysqldump pm_db1 > backup.sql`
2. Point `DB_*` at the database and run `alembic upgrade head` (the container does this automatically).
   - The old tables are renamed to `legacy_*` and kept untouched. Their rows are copied into the new schema with the same IDs, so attachment links survive.
   - Duplicate or blank user e-mails, orphaned upload links and bad dates are cleaned up. Anything skipped is printed.
3. Import the Firebase user export and e-mail everyone a set-password link:
   ```bash
   python -m app.cli import-users ../users.json --send-invites
   ```
   Firebase never exports password hashes, so **every existing user must set a new password**. They can also just use "Forgot password" on the sign-in page.
4. After verifying, the `legacy_*` tables can be dropped manually. `alembic downgrade base` restores them if you need to roll back.

The `uploads/` folder is reused as-is. In Docker it is mounted at `/data/uploads`.

---

## Local development

**Backend**
```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
alembic upgrade head                                 # uses DB_* / DATABASE_URL from ../.env
python -m app.cli create-admin --email you@company.com --name "You"
uvicorn app.main:app --reload --port 8000            # API docs: http://localhost:8000/api/docs
```

**Frontend**
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 — proxies /api to http://127.0.0.1:8000 (override with API_URL)
```
To open the dev server from another device, for example a phone over Tailscale, its hostname must be allowed.
The Tailscale host is already in `vite.config.ts`. Add others with `ALLOWED_HOSTS="a.example.com,b.example.com" npm run dev`.

**Tests**
```bash
cd backend && pytest                                         # 51 API tests on SQLite (never sends real e-mail)
TEST_DATABASE_URL="mysql+pymysql://user:pass@host/scratch_db" pytest   # same suite on MySQL (wipes that DB!)
cd frontend && npm test && npm run typecheck                 # calculation tests + TypeScript
```

### Useful commands
| Command | Purpose |
|---|---|
| `python -m app.cli create-admin --email … --name …` | Create or promote an admin (prompts for a password) |
| `python -m app.cli import-users users.json [--send-invites]` | Import the Firebase Auth export |
| `python -m app.cli invite --email …` | Send one user a set-password link |
| `python -m app.cli test-email --to … [--mailbox bom]` | Check the SMTP settings (account or BOM mailbox) |
| `alembic revision --autogenerate -m "…"` | New migration after changing `app/models.py` |

---

## Configuration (`.env`)
See `.env.example` for every option. Key ones:

| Variable | Notes |
|---|---|
| `SECRET_KEY` | ≥ 32 random characters, required in production |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | MySQL connection (or a full `DATABASE_URL`) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USERNAME` `SMTP_PASSWORD` `SMTP_FROM_EMAIL` `SMTP_FROM_NAME` `SMTP_STARTTLS` | Reset and invite e-mails. If unset, links are logged and shown to admins instead |
| `BOM_SMTP_HOST` `BOM_SMTP_PORT` `BOM_SMTP_USERNAME` `BOM_SMTP_PASSWORD` `BOM_SMTP_FROM_EMAIL` `BOM_SMTP_FROM_NAME` `BOM_SMTP_STARTTLS` | Mailbox that sends finalized Bills of Materials to stores. If unset, the BOM is still finalized and the app shows the link to send manually. Test with `python -m app.cli test-email --to … --mailbox bom` |
| `BOM_LINK_DAYS` | How long the PDF link in a BOM e-mail works (default 30) |
| `APP_BASE_URL` | Public URL used in e-mail links (must be reachable by stores for BOM links) |
| `PASSWORD_RESET_MINUTES` | Reset link lifetime (default 45) |
| `MAX_UPLOAD_MB` | Upload size limit (keep nginx `client_max_body_size` in step) |

## API overview
All under `/api/v1`. JSON uses camelCase; errors are always `{"error": {"code", "message", "details?"}}`.

- `auth/` login, refresh, logout, me, verify-password, change-password, forgot-password, reset-password
- `users`, `audit`: admin only
- `maintenance` (+ `export.csv`), `load-balancing`, `megger-tests`, `checklists`, `store-lists`
  - Endpoints: `GET` (paginated, `q`, `dateFrom`/`dateTo`), `GET /{id}`, `POST`, `PUT /{id}`
  - `GET` also takes `view=active|archived|all` (default `active`; not meaningful for `store-lists`)
  - `POST /archive` takes `{ids}` or `{before}`, plus `reason` and `dryRun`. `POST /unarchive` takes `{ids}`. Both are admin only and exist on every list except `store-lists`
  - Saving an archived record returns `409 archived`
  - `DELETE /{id}` and `POST /{id}/restore` are admin only
- Bills of Materials
  - `checklists/{id}/bom`: `GET`, `POST` (create); `checklists/{id}/bom/recipient` returns the suggested store e-mail
  - `boms/{id}`: `GET`, `PUT` (a finalized BOM reopens as a draft), `DELETE` (soft delete; revokes its links)
  - `boms/{id}/pdf` (`?download=1`), `boms/{id}/finalize`, `boms/{id}/resend`
  - `bom-images`: `POST` upload (JPG/PNG/WebP, 10 MB max); `bom-images/{id}`: `GET`
  - `public/bom/{token}`: the only unauthenticated endpoint. It serves the frozen PDF for that link, and returns `410` once the link expires or is revoked
- `uploads`: list, upload, `/{id}/file` (supports streaming / Range requests), trash, restore, purge (admin)
- `stats/dashboard` (active records only), `stats/performers`

Interactive docs are at `/api/docs` when not in production.
