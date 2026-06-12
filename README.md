# Estate Ledger

A multi-user, multi-estate workbench for executors: inventory with photos, expenses, an executor task checklist, document tracking, and contacts — shared with family and helpers through per-estate roles.

**Stack:** React (Vite) · Python (Flask) · SQLite · Google Sign-In

## Roles

Each estate has its own member list. People are invited by the Google email they sign in with.

| Role | Can do |
|---|---|
| **owner** | Everything, including inviting/removing people, changing roles, renaming or deleting the estate. An estate always keeps at least one owner. |
| **editor** | Add and change inventory, expenses, tasks, documents, contacts. Good for a co-executor or a sibling doing the inventory work. |
| **viewer** | Read-only. Good for beneficiaries who want visibility without edit access. |

Invites work before the person has ever signed in: the membership is stored by email and links to their account automatically on first login.

## 1. Google OAuth setup (one-time, ~5 minutes)

1. Go to https://console.cloud.google.com → create a project (e.g. "Estate Ledger").
2. **APIs & Services → OAuth consent screen**: External, fill in app name and your email. While in "Testing" mode only emails you add as test users can sign in — handy while you trial it; click **Publish app** when you want anyone to sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origins: `http://localhost:5173` for dev, plus your production URL (e.g. `https://estate.yourdomain.com`).
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

## 2. Run locally

```bash
# Backend
cd backend
pip install -r requirements.txt
export GOOGLE_CLIENT_ID="YOUR_ID.apps.googleusercontent.com"
export JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
python app.py            # http://127.0.0.1:8000

# Frontend (second terminal)
cd frontend
cp .env.example .env     # paste your client ID into .env
npm install
npm run dev              # http://localhost:5173 (proxies /api to the backend)
```

## 3. Deploying for others to use

The build is a single Python process that serves both the API and the built React app, with SQLite on disk — which makes hosting very simple.

### Option A — small VPS (recommended; ~$5/month, full control)

Hetzner, DigitalOcean, or Linode. On a fresh Ubuntu box:

```bash
# Build the frontend locally, or on the server:
cd frontend && npm install && npm run build

# Run the backend with gunicorn
cd ../backend
pip install -r requirements.txt
export GOOGLE_CLIENT_ID="..." JWT_SECRET="..." 
gunicorn -w 2 -b 127.0.0.1:8000 app:app
```

Put **Caddy** in front for automatic HTTPS (a `Caddyfile` of two lines):

```
estate.yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```

Add a systemd unit so it survives reboots, and a nightly cron to copy `estate.db` and `uploads/` somewhere safe — that's your whole backup story.

### Option B — PaaS (Fly.io, Railway, Render)

Zero server management; add a Dockerfile and deploy. **One caveat:** SQLite and uploaded photos live on disk, so you need a persistent volume (Fly volumes, Railway volumes, Render disks). Ephemeral filesystems will lose data on redeploy.

### Why SQLite is fine here

A handful of estates with a few family members each is hundreds of writes per day, not per second. SQLite handles this easily on one server and makes backups a file copy. If this ever grows into a real product with many concurrent users, swap to Postgres — the SQL in `app.py` is standard and ports over with minor changes.

### Production checklist

- Set a fixed `JWT_SECRET` (otherwise sessions reset on every restart).
- Add your production domain to the Google OAuth authorized origins.
- Publish the OAuth consent screen out of Testing mode.
- Photo files are served at unguessable random URLs but are not auth-gated; for stricter privacy, gate `/uploads/` behind the session check.
- Back up `estate.db` and `uploads/` regularly.

## Project layout

```
backend/
  app.py             # Flask API: auth, estates, members/roles, CRUD, photo upload
  requirements.txt
frontend/
  src/App.jsx        # sign-in, estate list, shell
  src/EstateView.jsx # tabs: overview, inventory, expenses, tasks, documents, contacts, people
  src/ui.jsx         # design tokens + shared components
  src/api.js         # fetch wrapper with JWT
```
