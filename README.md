# Dinto Prefab Request Book — Netlify app

Digitized replacement for the paper prefabrication book. Foremen browse the 29-assembly
catalog, configure builds with the book's ordering codes, and submit requests. The prefab
department works a queue, drags requests onto build weeks, and prints build tickets with
per-unit materials rolled up into a consolidated pull list. Admin maintains material
templates (Conest import) and user accounts.

Built from the `design_handoff_prefab_request_book` package: Vite + React + TypeScript
frontend, Netlify Functions + Netlify Blobs backend, real sign-in with per-role permissions
**enforced server-side**.

## Deploy

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket) and click **Add new site →
   Import an existing project** in Netlify — or use the CLI:

   ```bash
   npm install
   npx netlify deploy --build --prod
   ```

2. Build settings are already in `netlify.toml` (`npm run build` → `dist`, functions in
   `netlify/functions`). Netlify Blobs and Functions need no extra setup. Use build image
   with Node 20+.

3. *(Optional but recommended)* In Site settings → Environment variables, set
   `SESSION_SECRET` to a long random string. If unset, the app generates one on first run
   and stores it in Blobs — that works fine, but an env var survives a blobs wipe.

## First sign-in

Five accounts are seeded automatically on first use, all with the password **`Dinto2026!`**:

| Username  | Name                  | Role         |
|-----------|-----------------------|--------------|
| `ralvarez`| R. Alvarez — Foreman  | foreman      |
| `tdoyle`  | T. Doyle — Foreman    | foreman      |
| `mkaur`   | M. Kaur — Foreman     | foreman      |
| `sruiz`   | S. Ruiz — Prefab Lead | prefab       |
| `jnowak`  | J. Nowak — Admin      | admin        |

**Sign in as `jnowak` first, open Users, and either reset these passwords or replace the
seed accounts with real ones.** Everyone can change their own password from the account
menu (top right).

Roles and what they see:

- **Foreman** — Catalog, Request (review & submit), Mine (own requests only)
- **Prefab dept.** — Queue, Schedule, Ticket
- **Admin** — everything, plus Materials (Conest templates) and Users (accounts)

Permissions are enforced in the functions, not just the UI: a foreman calling the API
directly cannot read another foreman's requests, change a status, edit materials, or touch
accounts.

## Where data lives

| Data | Storage |
|---|---|
| Requests (header, lines, status, week, mfg overrides) | Netlify Blobs, one blob per request |
| Material templates (per-unit BOM) | Netlify Blobs, one blob per assembly |
| User accounts (scrypt-hashed passwords) | Netlify Blobs |
| Catalog + option schemas | Static in the bundle (changes with a deploy) |
| In-progress cart | `localStorage` on the device, per signed-in user |
| Session | Signed HttpOnly cookie, 30 days |

## API surface

```
GET    /api/me                        session user
POST   /api/auth                      sign in            DELETE /api/auth   sign out
POST   /api/auth/password             change own password
GET    /api/requests                  list (foremen see only their own)
POST   /api/requests                  submit (foreman/admin; "by" comes from the session)
PATCH  /api/requests/:id              { status } | { week } | { lineIdx,rowIdx,mfg }  (prefab/admin)
DELETE /api/requests/:id              admin only
GET    /api/materials                 all per-unit templates
PUT    /api/materials/:assemblyId     replace one template (admin only)
GET    /api/users                     admin only
POST   /api/users                     create account (admin only)
PATCH  /api/users/:username           reset password / role / active (admin only)
```

## Local development

```bash
npm install
npx netlify dev      # runs Vite + Functions + Blobs emulation on :8888
```

## Seeded material templates

Only assemblies **02** (1 Gang Outlet) and **13** (90° Bends) ship with material templates,
as in the handoff. The other 27 show "Materials not loaded — pending Conest import" on
build tickets until the admin pastes the Conest export in Admin › Materials. Accepted
import shapes: 5 columns (explicit class) · 4 columns (class inferred from description) ·
3 columns where column 2 is `MFG; Cat#` (legacy).

## Known gaps carried over from the handoff

1. ASSEMBLY / SYMBOL codes are blank on the book scan — descriptions serve as identifiers.
2. 27 of 29 assemblies need the Conest material export.
3. Panelboard checkbox options are plausible placeholders pending the real lists.
