"""
Estate Ledger — multi-user, multi-estate executor app.
Flask + SQLite backend with Google Sign-In and per-estate roles.

Roles per estate:
  owner   — everything, including member management and deleting the estate
  editor  — full read/write on estate data (co-executor, helper)
  viewer  — read-only (beneficiary, family member)
"""

import os
import json
import time
import sqlite3
import secrets
import functools

from flask import Flask, request, jsonify, g, send_from_directory
import jwt  # PyJWT
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

# ————— Config —————
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "estate.db"))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(BASE_DIR, "uploads"))
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")  # required
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))  # set this in prod!
JWT_TTL = 60 * 60 * 24 * 14  # 14 days

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder=None)

# ————— Database —————
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS estates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY,
  estate_id INTEGER NOT NULL,
  email TEXT NOT NULL,            -- invite by email; works before first login
  user_id INTEGER,                -- filled once that email signs in
  role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
  UNIQUE(estate_id, email)
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  estate_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT, location TEXT, value REAL DEFAULT 0,
  status TEXT DEFAULT 'Undecided', beneficiary TEXT, notes TEXT,
  photo TEXT,                     -- filename in uploads/
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  estate_id INTEGER NOT NULL,
  date TEXT, payee TEXT, category TEXT, amount REAL DEFAULT 0,
  reimbursable INTEGER DEFAULT 0, paid_by TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  estate_id INTEGER NOT NULL,
  phase TEXT, title TEXT NOT NULL, due TEXT, done INTEGER DEFAULT 0,
  assigned_to TEXT                -- member email, optional
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  estate_id INTEGER NOT NULL,
  name TEXT NOT NULL, role TEXT, phone TEXT, email TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  estate_id INTEGER NOT NULL,
  name TEXT NOT NULL, status TEXT DEFAULT 'needed', note TEXT
);
"""

SEED_TASKS = [
    ("Immediate", "Order certified death certificates (10-12 copies)"),
    ("Immediate", "Secure the home, vehicles, and valuables"),
    ("Immediate", "Locate the original will and any codicils"),
    ("Immediate", "Notify close family and the named attorney"),
    ("Probate", "File the will with the probate court"),
    ("Probate", "Petition for letters testamentary"),
    ("Probate", "Obtain an EIN for the estate (IRS)"),
    ("Probate", "Open an estate bank account"),
    ("Probate", "Publish notice to creditors"),
    ("Probate", "Notify Social Security and pension providers"),
    ("Administration", "Inventory and appraise all assets"),
    ("Administration", "Notify banks, insurers, and brokerages"),
    ("Administration", "Forward mail to the executor"),
    ("Administration", "Cancel cards, subscriptions, and utilities"),
    ("Administration", "Pay valid debts and ongoing estate expenses"),
    ("Administration", "File the decedent's final income tax return"),
    ("Administration", "Determine if an estate tax return is required"),
    ("Closing", "Prepare the final accounting"),
    ("Closing", "Distribute assets to beneficiaries"),
    ("Closing", "Collect signed receipts and releases"),
    ("Closing", "Petition the court to close the estate"),
]

SEED_DOCS = [
    "Original will and codicils", "Certified death certificates", "Trust documents",
    "Property deeds", "Vehicle titles and registrations", "Bank and credit card statements",
    "Investment and brokerage statements", "Life insurance policies",
    "Retirement account documents", "Tax returns (last 3 years)",
    "Outstanding bills and loan documents", "Marriage and birth certificates",
    "Safe deposit box keys / info",
]


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


init_db()

# ————— Auth —————

def make_token(user_id):
    return jwt.encode({"uid": user_id, "exp": int(time.time()) + JWT_TTL}, JWT_SECRET, algorithm="HS256")


def auth_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Sign in required"}), 401
        try:
            payload = jwt.decode(header[7:], JWT_SECRET, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            return jsonify({"error": "Session expired — sign in again"}), 401
        row = db().execute("SELECT * FROM users WHERE id = ?", (payload["uid"],)).fetchone()
        if not row:
            return jsonify({"error": "Unknown user"}), 401
        g.user = dict(row)
        return fn(*args, **kwargs)
    return wrapper


def get_role(estate_id):
    row = db().execute(
        "SELECT role FROM memberships WHERE estate_id = ? AND email = ?",
        (estate_id, g.user["email"]),
    ).fetchone()
    return row["role"] if row else None


def estate_access(min_role):
    """min_role: 'viewer' < 'editor' < 'owner'"""
    order = {"viewer": 0, "editor": 1, "owner": 2}

    def deco(fn):
        @functools.wraps(fn)
        def wrapper(estate_id, *args, **kwargs):
            role = get_role(estate_id)
            if role is None:
                return jsonify({"error": "You don't have access to this estate"}), 403
            if order[role] < order[min_role]:
                return jsonify({"error": f"This action needs {min_role} access"}), 403
            g.role = role
            return fn(estate_id, *args, **kwargs)
        return wrapper
    return deco


@app.post("/api/auth/google")
def auth_google():
    """Frontend sends the Google Identity Services credential (ID token)."""
    credential = (request.json or {}).get("credential")
    if not credential:
        return jsonify({"error": "Missing credential"}), 400
    try:
        info = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except Exception:
        return jsonify({"error": "Google sign-in could not be verified"}), 401

    email = info["email"].lower()
    name = info.get("name", "")
    picture = info.get("picture", "")

    conn = db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if row:
        user_id = row["id"]
        conn.execute("UPDATE users SET name = ?, picture = ? WHERE id = ?", (name, picture, user_id))
    else:
        cur = conn.execute(
            "INSERT INTO users (email, name, picture, created_at) VALUES (?,?,?,?)",
            (email, name, picture, int(time.time())),
        )
        user_id = cur.lastrowid
    # link any pending invites for this email
    conn.execute("UPDATE memberships SET user_id = ? WHERE email = ? AND user_id IS NULL", (user_id, email))
    conn.commit()

    return jsonify({
        "token": make_token(user_id),
        "user": {"id": user_id, "email": email, "name": name, "picture": picture},
    })


# ————— Estates & members —————

@app.get("/api/estates")
@auth_required
def list_estates():
    rows = db().execute(
        """SELECT e.id, e.name, m.role,
                  (SELECT COUNT(*) FROM memberships m2 WHERE m2.estate_id = e.id) AS member_count
           FROM estates e JOIN memberships m ON m.estate_id = e.id
           WHERE m.email = ? ORDER BY e.created_at DESC""",
        (g.user["email"],),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/estates")
@auth_required
def create_estate():
    name = (request.json or {}).get("name", "").strip()
    if not name:
        return jsonify({"error": "Estate name is required"}), 400
    conn = db()
    cur = conn.execute(
        "INSERT INTO estates (name, created_by, created_at) VALUES (?,?,?)",
        (name, g.user["id"], int(time.time())),
    )
    estate_id = cur.lastrowid
    conn.execute(
        "INSERT INTO memberships (estate_id, email, user_id, role) VALUES (?,?,?,'owner')",
        (estate_id, g.user["email"], g.user["id"]),
    )
    for phase, title in SEED_TASKS:
        conn.execute("INSERT INTO tasks (estate_id, phase, title) VALUES (?,?,?)", (estate_id, phase, title))
    for doc in SEED_DOCS:
        conn.execute("INSERT INTO documents (estate_id, name) VALUES (?,?)", (estate_id, doc))
    conn.commit()
    return jsonify({"id": estate_id, "name": name, "role": "owner"}), 201


@app.patch("/api/estates/<int:estate_id>")
@auth_required
@estate_access("owner")
def rename_estate(estate_id):
    name = (request.json or {}).get("name", "").strip()
    if name:
        db().execute("UPDATE estates SET name = ? WHERE id = ?", (name, estate_id))
        db().commit()
    return jsonify({"ok": True})


@app.delete("/api/estates/<int:estate_id>")
@auth_required
@estate_access("owner")
def delete_estate(estate_id):
    conn = db()
    for table in ("items", "expenses", "tasks", "contacts", "documents", "memberships"):
        conn.execute(f"DELETE FROM {table} WHERE estate_id = ?", (estate_id,))
    conn.execute("DELETE FROM estates WHERE id = ?", (estate_id,))
    conn.commit()
    return jsonify({"ok": True})


@app.get("/api/estates/<int:estate_id>/members")
@auth_required
@estate_access("viewer")
def list_members(estate_id):
    rows = db().execute(
        """SELECT m.id, m.email, m.role, u.name, u.picture
           FROM memberships m LEFT JOIN users u ON u.id = m.user_id
           WHERE m.estate_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END""",
        (estate_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/estates/<int:estate_id>/members")
@auth_required
@estate_access("owner")
def add_member(estate_id):
    body = request.json or {}
    email = body.get("email", "").strip().lower()
    role = body.get("role", "viewer")
    if not email or "@" not in email:
        return jsonify({"error": "A valid email is required"}), 400
    if role not in ("owner", "editor", "viewer"):
        return jsonify({"error": "Role must be owner, editor, or viewer"}), 400
    conn = db()
    user = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    try:
        conn.execute(
            "INSERT INTO memberships (estate_id, email, user_id, role) VALUES (?,?,?,?)",
            (estate_id, email, user["id"] if user else None, role),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "That person is already a member"}), 409
    return jsonify({"ok": True}), 201


@app.patch("/api/estates/<int:estate_id>/members/<int:member_id>")
@auth_required
@estate_access("owner")
def change_role(estate_id, member_id):
    role = (request.json or {}).get("role")
    if role not in ("owner", "editor", "viewer"):
        return jsonify({"error": "Role must be owner, editor, or viewer"}), 400
    conn = db()
    if role != "owner":
        owners = conn.execute(
            "SELECT COUNT(*) AS c FROM memberships WHERE estate_id = ? AND role = 'owner' AND id != ?",
            (estate_id, member_id),
        ).fetchone()["c"]
        target = conn.execute("SELECT role FROM memberships WHERE id = ? AND estate_id = ?", (member_id, estate_id)).fetchone()
        if target and target["role"] == "owner" and owners == 0:
            return jsonify({"error": "An estate needs at least one owner"}), 400
    conn.execute("UPDATE memberships SET role = ? WHERE id = ? AND estate_id = ?", (role, member_id, estate_id))
    conn.commit()
    return jsonify({"ok": True})


@app.delete("/api/estates/<int:estate_id>/members/<int:member_id>")
@auth_required
@estate_access("owner")
def remove_member(estate_id, member_id):
    conn = db()
    target = conn.execute("SELECT role FROM memberships WHERE id = ? AND estate_id = ?", (member_id, estate_id)).fetchone()
    if target and target["role"] == "owner":
        owners = conn.execute(
            "SELECT COUNT(*) AS c FROM memberships WHERE estate_id = ? AND role = 'owner'", (estate_id,)
        ).fetchone()["c"]
        if owners <= 1:
            return jsonify({"error": "An estate needs at least one owner"}), 400
    conn.execute("DELETE FROM memberships WHERE id = ? AND estate_id = ?", (member_id, estate_id))
    conn.commit()
    return jsonify({"ok": True})


# ————— Generic CRUD for estate data —————

TABLES = {
    "items": ["name", "category", "location", "value", "status", "beneficiary", "notes"],
    "expenses": ["date", "payee", "category", "amount", "reimbursable", "paid_by", "notes"],
    "tasks": ["phase", "title", "due", "done", "assigned_to"],
    "contacts": ["name", "role", "phone", "email", "notes"],
    "documents": ["name", "status", "note"],
}


def crud_routes(table, fields):
    list_name = f"list_{table}"
    create_name = f"create_{table}"
    update_name = f"update_{table}"
    delete_name = f"delete_{table}"

    @app.get(f"/api/estates/<int:estate_id>/{table}", endpoint=list_name)
    @auth_required
    @estate_access("viewer")
    def _list(estate_id):
        rows = db().execute(f"SELECT * FROM {table} WHERE estate_id = ? ORDER BY id DESC", (estate_id,)).fetchall()
        return jsonify([dict(r) for r in rows])

    @app.post(f"/api/estates/<int:estate_id>/{table}", endpoint=create_name)
    @auth_required
    @estate_access("editor")
    def _create(estate_id):
        body = request.json or {}
        cols = ["estate_id"] + fields + (["created_at"] if table == "items" else [])
        vals = [estate_id] + [body.get(f) for f in fields] + ([int(time.time())] if table == "items" else [])
        placeholders = ",".join("?" * len(cols))
        cur = db().execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders})", vals)
        db().commit()
        row = db().execute(f"SELECT * FROM {table} WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(dict(row)), 201

    @app.patch(f"/api/estates/<int:estate_id>/{table}/<int:row_id>", endpoint=update_name)
    @auth_required
    @estate_access("editor")
    def _update(estate_id, row_id):
        body = request.json or {}
        updates = {k: v for k, v in body.items() if k in fields}
        if updates:
            sets = ",".join(f"{k} = ?" for k in updates)
            db().execute(
                f"UPDATE {table} SET {sets} WHERE id = ? AND estate_id = ?",
                list(updates.values()) + [row_id, estate_id],
            )
            db().commit()
        row = db().execute(f"SELECT * FROM {table} WHERE id = ? AND estate_id = ?", (row_id, estate_id)).fetchone()
        return jsonify(dict(row) if row else {})

    @app.delete(f"/api/estates/<int:estate_id>/{table}/<int:row_id>", endpoint=delete_name)
    @auth_required
    @estate_access("editor")
    def _delete(estate_id, row_id):
        row = db().execute(f"SELECT * FROM {table} WHERE id = ? AND estate_id = ?", (row_id, estate_id)).fetchone()
        if table == "items" and row and row["photo"]:
            try:
                os.remove(os.path.join(UPLOAD_DIR, row["photo"]))
            except OSError:
                pass
        db().execute(f"DELETE FROM {table} WHERE id = ? AND estate_id = ?", (row_id, estate_id))
        db().commit()
        return jsonify({"ok": True})


for _table, _fields in TABLES.items():
    crud_routes(_table, _fields)


# ————— Item photos —————

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@app.post("/api/estates/<int:estate_id>/items/<int:item_id>/photo")
@auth_required
@estate_access("editor")
def upload_photo(estate_id, item_id):
    f = request.files.get("photo")
    if not f:
        return jsonify({"error": "No photo attached"}), 400
    ext = os.path.splitext(f.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"error": "Use a JPG, PNG, WEBP, or GIF image"}), 400
    row = db().execute("SELECT photo FROM items WHERE id = ? AND estate_id = ?", (item_id, estate_id)).fetchone()
    if not row:
        return jsonify({"error": "Item not found"}), 404
    if row["photo"]:
        try:
            os.remove(os.path.join(UPLOAD_DIR, row["photo"]))
        except OSError:
            pass
    name = secrets.token_urlsafe(24) + ext
    f.save(os.path.join(UPLOAD_DIR, name))
    db().execute("UPDATE items SET photo = ? WHERE id = ?", (name, item_id))
    db().commit()
    return jsonify({"photo": name})


@app.get("/uploads/<path:name>")
def serve_upload(name):
    # Filenames are long random tokens; for stricter privacy, move behind auth + signed URLs.
    return send_from_directory(UPLOAD_DIR, name, max_age=86400)


# ————— Serve the built frontend (production) —————

DIST = os.path.join(BASE_DIR, "..", "frontend", "dist")


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path):
    full = os.path.join(DIST, path)
    if path and os.path.isfile(full):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
