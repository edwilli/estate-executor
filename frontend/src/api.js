// Thin API client. Token lives in localStorage; every call sends it.
const TOKEN_KEY = "estate_token";
const USER_KEY = "estate_user";

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  set({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function call(method, path, body, isForm = false) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401) { session.clear(); window.location.reload(); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export const api = {
  get: (p) => call("GET", p),
  post: (p, b) => call("POST", p, b),
  patch: (p, b) => call("PATCH", p, b),
  del: (p) => call("DELETE", p),
  upload: (p, file) => {
    const form = new FormData();
    form.append("photo", file);
    return call("POST", p, form, true);
  },
};
