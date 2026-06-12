import React, { useState, useEffect, useRef } from "react";
import { api, session } from "./api";
import EstateView from "./EstateView";
import { T, Btn, Panel, inputStyle } from "./ui";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function App() {
  const [user, setUser] = useState(session.user);
  const [estates, setEstates] = useState(null);
  const [activeEstate, setActiveEstate] = useState(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const gsiRef = useRef(null);

  // Google Identity Services button
  useEffect(() => {
    if (user) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp) => {
          try {
            const data = await api.post("/auth/google", { credential: resp.credential });
            session.set(data);
            setUser(data.user);
          } catch (e) { setError(e.message); }
        },
      });
      window.google.accounts.id.renderButton(gsiRef.current, {
        theme: "outline", size: "large", text: "signin_with", shape: "pill",
      });
    };
    document.body.appendChild(s);
    return () => s.remove();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.get("/estates").then(setEstates).catch((e) => setError(e.message));
  }, [user]);

  const createEstate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await api.post("/estates", { name: newName.trim() });
      setEstates([{ ...created, member_count: 1 }, ...(estates || [])]);
      setNewName("");
      setActiveEstate(created);
    } catch (e) { setError(e.message); }
  };

  const signOut = () => { session.clear(); setUser(null); setEstates(null); setActiveEstate(null); };

  // ——— Signed out ———
  if (!user) {
    return (
      <Shell>
        <div style={{ maxWidth: 420, margin: "12vh auto 0", textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: T.brass, fontWeight: 700 }}>Estate Ledger</div>
          <h1 style={{ fontFamily: T.serif, fontSize: 34, margin: "8px 0 6px" }}>The executor's workbench</h1>
          <p style={{ color: T.inkSoft, fontSize: 15, lineHeight: 1.5 }}>
            Inventory, expenses, tasks, and documents for settling an estate — shared with the people helping you.
          </p>
          <div ref={gsiRef} style={{ display: "flex", justifyContent: "center", marginTop: 24 }} />
          {error && <p style={{ color: T.danger, fontSize: 13 }}>{error}</p>}
        </div>
      </Shell>
    );
  }

  // ——— Inside an estate ———
  if (activeEstate) {
    return (
      <Shell user={user} onSignOut={signOut} onHome={() => setActiveEstate(null)}>
        <EstateView estate={activeEstate} user={user} onLeave={() => setActiveEstate(null)} />
      </Shell>
    );
  }

  // ——— Estate picker ———
  return (
    <Shell user={user} onSignOut={signOut}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontFamily: T.serif, fontSize: 26, marginBottom: 4 }}>Your estates</h1>
        <p style={{ color: T.inkSoft, fontSize: 14, marginTop: 0 }}>
          Estates you own or have been invited to help with.
        </p>
        <Panel style={{ padding: 14, display: "flex", gap: 10, marginBottom: 18 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Estate of …" onKeyDown={(e) => e.key === "Enter" && createEstate()} />
          <Btn onClick={createEstate}>Create estate</Btn>
        </Panel>
        {error && <p style={{ color: T.danger, fontSize: 13 }}>{error}</p>}
        {estates === null && <p style={{ color: T.inkSoft }}>Loading…</p>}
        {estates && estates.length === 0 && (
          <Panel style={{ padding: 32, textAlign: "center", color: T.inkSoft }}>
            No estates yet. Create one above, or ask an executor to invite you with your Google email.
          </Panel>
        )}
        {estates && estates.map((e) => (
          <Panel key={e.id} style={{ padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <div onClick={() => setActiveEstate(e)} style={{ flex: 1 }}>
              <div style={{ fontFamily: T.serif, fontSize: 18 }}>{e.name}</div>
              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                {e.member_count} member{e.member_count !== 1 ? "s" : ""} · you are {e.role === "owner" ? "an owner" : e.role === "editor" ? "an editor" : "a viewer"}
              </div>
            </div>
            <Btn kind="ghost" small onClick={() => setActiveEstate(e)}>Open</Btn>
          </Panel>
        ))}
      </div>
    </Shell>
  );
}

function Shell({ children, user, onSignOut, onHome }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <div style={{ borderBottom: `1px solid ${T.line}`, background: T.bg }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div onClick={onHome} style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: T.brass, fontWeight: 700, cursor: onHome ? "pointer" : "default" }}>
            Estate Ledger
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {user && (
              <>
                {user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" style={{ width: 26, height: 26, borderRadius: "50%" }} />}
                <span style={{ fontSize: 13, color: T.inkSoft }}>{user.name || user.email}</span>
                <Btn kind="ghost" small onClick={onSignOut}>Sign out</Btn>
              </>
            )}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 60px" }}>{children}</div>
    </div>
  );
}
