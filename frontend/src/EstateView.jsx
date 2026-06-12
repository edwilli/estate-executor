import React, { useState, useEffect, useMemo, useRef } from "react";
import { api } from "./api";
import {
  T, fmtUSD, inputStyle, Field, Btn, Badge, Panel,
  STATUS_COLOR, INV_CATEGORIES, INV_STATUSES, EXP_CATEGORIES,
} from "./ui";

const canEdit = (role) => role === "owner" || role === "editor";

export default function EstateView({ estate, user, onLeave }) {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({ items: [], expenses: [], tasks: [], contacts: [], documents: [], members: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const role = estate.role;

  const refresh = async () => {
    try {
      const [items, expenses, tasks, contacts, documents, members] = await Promise.all([
        api.get(`/estates/${estate.id}/items`),
        api.get(`/estates/${estate.id}/expenses`),
        api.get(`/estates/${estate.id}/tasks`),
        api.get(`/estates/${estate.id}/contacts`),
        api.get(`/estates/${estate.id}/documents`),
        api.get(`/estates/${estate.id}/members`),
      ]);
      setData({ items, expenses, tasks, contacts, documents, members });
      setLoaded(true);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { refresh(); }, [estate.id]);

  const totals = useMemo(() => ({
    estateValue: data.items.reduce((s, i) => s + (Number(i.value) || 0), 0),
    expTotal: data.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    reimb: data.expenses.filter((e) => e.reimbursable).reduce((s, e) => s + (Number(e.amount) || 0), 0),
    tDone: data.tasks.filter((t) => t.done).length,
    dLocated: data.documents.filter((d) => d.status === "located").length,
  }), [data]);

  const tabs = [
    ["overview", "Overview"],
    ["items", `Inventory (${data.items.length})`],
    ["expenses", "Expenses"],
    ["tasks", `Tasks (${totals.tDone}/${data.tasks.length})`],
    ["documents", "Documents"],
    ["contacts", "Contacts"],
    ["members", `People (${data.members.length})`],
  ];

  if (!loaded) return <p style={{ color: T.inkSoft }}>Opening the ledger…</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: T.serif, fontSize: 28, margin: 0 }}>{estate.name}</h1>
        <Badge text={role} color={role === "owner" ? T.brass : role === "editor" ? T.sage : "#8A8F87"} />
        <Btn kind="ghost" small style={{ marginLeft: "auto" }} onClick={onLeave}>← All estates</Btn>
      </div>
      {role === "viewer" && (
        <p style={{ fontSize: 13, color: T.inkSoft, margin: "6px 0 0" }}>You have view-only access to this estate.</p>
      )}
      {error && <p style={{ color: T.danger, fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", gap: 4, margin: "16px 0", borderBottom: `2px solid ${T.ink}`, flexWrap: "wrap" }}>
        {tabs.map(([key, name]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            fontFamily: T.sans, fontSize: 13, fontWeight: 600, cursor: "pointer",
            padding: "9px 14px", border: `1px solid ${tab === key ? T.ink : "transparent"}`,
            borderBottom: "none", borderRadius: "8px 8px 0 0", position: "relative", top: 2,
            background: tab === key ? T.panel : "transparent", color: tab === key ? T.ink : T.inkSoft,
          }}>{name}</button>
        ))}
      </div>

      {tab === "overview" && <Overview totals={totals} data={data} goTo={setTab} />}
      {tab === "items" && <Inventory estateId={estate.id} items={data.items} refresh={refresh} editable={canEdit(role)} />}
      {tab === "expenses" && <Expenses estateId={estate.id} expenses={data.expenses} refresh={refresh} editable={canEdit(role)} user={user} />}
      {tab === "tasks" && <Tasks estateId={estate.id} tasks={data.tasks} members={data.members} refresh={refresh} editable={canEdit(role)} />}
      {tab === "documents" && <Documents estateId={estate.id} docs={data.documents} refresh={refresh} editable={canEdit(role)} />}
      {tab === "contacts" && <Contacts estateId={estate.id} contacts={data.contacts} refresh={refresh} editable={canEdit(role)} />}
      {tab === "members" && <Members estateId={estate.id} members={data.members} refresh={refresh} isOwner={role === "owner"} user={user} />}
    </div>
  );
}

// ————— Overview —————
function Overview({ totals, data, goTo }) {
  const nextUp = data.tasks.filter((t) => !t.done).slice(0, 4);
  const Stat = ({ label, value, sub, target }) => (
    <Panel style={{ padding: "16px 18px", flex: "1 1 200px", cursor: "pointer" }}>
      <div onClick={() => goTo(target)}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: T.mono, fontSize: 26, fontWeight: 600 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{sub}</div>}
      </div>
    </Panel>
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Stat label="Estate value (inventoried)" value={fmtUSD(totals.estateValue)} sub={`${data.items.length} items recorded`} target="items" />
        <Stat label="Estate expenses" value={fmtUSD(totals.expTotal)} sub={`${fmtUSD(totals.reimb)} reimbursable`} target="expenses" />
        <Stat label="Tasks complete" value={`${totals.tDone} / ${data.tasks.length}`} sub="Across all phases" target="tasks" />
        <Stat label="Documents located" value={`${totals.dLocated} / ${data.documents.length}`} sub="Key papers checklist" target="documents" />
      </div>
      <Panel style={{ padding: 18, marginTop: 14 }}>
        <div style={{ fontFamily: T.serif, fontSize: 18, marginBottom: 10 }}>Next up</div>
        {nextUp.length === 0 && <div style={{ color: T.inkSoft, fontSize: 14 }}>Every task is checked off.</div>}
        {nextUp.map((t) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.lineSoft}`, fontSize: 14 }}>
            <span>{t.title}{t.assigned_to ? <span style={{ color: T.inkSoft }}> · {t.assigned_to}</span> : ""}</span>
            <span style={{ color: T.brass, fontSize: 12, whiteSpace: "nowrap" }}>{t.phase}{t.due ? ` · due ${t.due}` : ""}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ————— Inventory —————
function Inventory({ estateId, items, refresh, editable }) {
  const blank = { name: "", category: "Household", location: "", value: "", status: "Undecided", beneficiary: "", notes: "" };
  const [editing, setEditing] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const shown = items.filter((i) =>
    (filter === "All" || i.status === filter) &&
    (query === "" || `${i.name} ${i.location} ${i.beneficiary} ${i.notes}`.toLowerCase().includes(query.toLowerCase()))
  );

  const saveItem = async () => {
    if (!editing.name.trim() || busy) return;
    setBusy(true);
    try {
      let saved;
      if (editing.id) saved = await api.patch(`/estates/${estateId}/items/${editing.id}`, editing);
      else saved = await api.post(`/estates/${estateId}/items`, editing);
      if (photoFile && saved && saved.id) {
        await api.upload(`/estates/${estateId}/items/${saved.id}/photo`, photoFile);
      }
      setEditing(null); setPhotoFile(null);
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        {editable && <Btn onClick={() => { setEditing({ ...blank }); setPhotoFile(null); }}>+ Add item</Btn>}
        <input placeholder="Search items…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, width: 220 }} />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, width: 150 }}>
          {["All", ...INV_STATUSES].map((s) => <option key={s}>{s}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 14, color: T.brass }}>
          {fmtUSD(shown.reduce((s, i) => s + (Number(i.value) || 0), 0))} shown
        </div>
      </div>

      {editing && (
        <Panel style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ fontFamily: T.serif, fontSize: 18, marginBottom: 14 }}>{editing.id ? "Edit item" : "New item"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <Field label="Item name"><input style={inputStyle} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Oak roll-top desk" /></Field>
            <Field label="Category">
              <select style={inputStyle} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {INV_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Location"><input style={inputStyle} value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
            <Field label="Estimated value ($)"><input style={inputStyle} type="number" value={editing.value || ""} onChange={(e) => setEditing({ ...editing, value: e.target.value })} /></Field>
            <Field label="Disposition">
              <select style={inputStyle} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {INV_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Beneficiary / destination"><input style={inputStyle} value={editing.beneficiary || ""} onChange={(e) => setEditing({ ...editing, beneficiary: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setPhotoFile(e.target.files && e.target.files[0])} />
            <Btn kind="ghost" onClick={() => fileRef.current && fileRef.current.click()}>
              {photoFile ? `Photo: ${photoFile.name}` : editing.photo ? "Replace photo" : "Add photo"}
            </Btn>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <Btn kind="ghost" onClick={() => { setEditing(null); setPhotoFile(null); }}>Cancel</Btn>
              <Btn onClick={saveItem} disabled={busy}>{busy ? "Saving…" : "Save item"}</Btn>
            </div>
          </div>
        </Panel>
      )}

      {shown.length === 0 && !editing && (
        <Panel style={{ padding: 40, textAlign: "center", color: T.inkSoft }}>
          No items yet.{editable ? " Add the first one — a photo and a rough value are enough to start." : ""}
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
        {shown.map((item) => (
          <Panel key={item.id} style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ height: 140, background: "#EDEFEA", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {item.photo
                ? <img src={`/uploads/${item.photo}`} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ color: "#B7BDB3", fontFamily: T.serif, fontSize: 28 }}>¶</span>}
            </div>
            <div style={{ padding: "12px 14px", flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                <div style={{ fontFamily: T.mono, color: T.brass, fontSize: 14, whiteSpace: "nowrap" }}>{fmtUSD(item.value)}</div>
              </div>
              <div style={{ fontSize: 12, color: T.inkSoft, margin: "4px 0 8px" }}>{item.category}{item.location ? ` · ${item.location}` : ""}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Badge text={item.status} color={STATUS_COLOR[item.status] || T.inkSoft} />
                {item.beneficiary && <span style={{ fontSize: 12, color: T.inkSoft }}>→ {item.beneficiary}</span>}
              </div>
            </div>
            {editable && (
              <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.lineSoft}`, display: "flex", gap: 8 }}>
                <Btn kind="ghost" small onClick={() => { setEditing({ ...item }); setPhotoFile(null); }}>Edit</Btn>
                <Btn kind="danger" small onClick={async () => { await api.del(`/estates/${estateId}/items/${item.id}`); refresh(); }}>Delete</Btn>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}

// ————— Expenses —————
function Expenses({ estateId, expenses, refresh, editable, user }) {
  const blank = { date: new Date().toISOString().slice(0, 10), payee: "", category: "Legal & Court", amount: "", reimbursable: 0, paid_by: user.email, notes: "" };
  const [draft, setDraft] = useState(blank);
  const [catFilter, setCatFilter] = useState("All");

  const shown = expenses
    .filter((e) => catFilter === "All" || e.category === catFilter)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const total = shown.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const byCat = EXP_CATEGORIES.map((c) => ({
    c, sum: expenses.filter((e) => e.category === c).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  })).filter((x) => x.sum > 0);
  const maxCat = Math.max(1, ...byCat.map((x) => x.sum));

  const add = async () => {
    if (!draft.amount) return;
    await api.post(`/estates/${estateId}/expenses`, draft);
    setDraft(blank);
    refresh();
  };

  return (
    <div>
      {editable && (
        <Panel style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ fontFamily: T.serif, fontSize: 18, marginBottom: 14 }}>Record an expense</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
            <Field label="Date"><input style={inputStyle} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
            <Field label="Paid to"><input style={inputStyle} value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} placeholder="County clerk, utility co.…" /></Field>
            <Field label="Category">
              <select style={inputStyle} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {EXP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Amount ($)"><input style={inputStyle} type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></Field>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={!!draft.reimbursable} onChange={(e) => setDraft({ ...draft, reimbursable: e.target.checked ? 1 : 0 })} />
              Paid out of pocket (reimbursable)
            </label>
            <input style={{ ...inputStyle, flex: 1, minWidth: 180 }} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Note (optional)" />
            <Btn onClick={add}>Add expense</Btn>
          </div>
        </Panel>
      )}

      {byCat.length > 0 && (
        <Panel style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ fontFamily: T.serif, fontSize: 18, marginBottom: 12 }}>Where the money went</div>
          {byCat.map(({ c, sum }) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, fontSize: 13 }}>
              <div style={{ width: 160, color: T.inkSoft }}>{c}</div>
              <div style={{ flex: 1, background: T.lineSoft, borderRadius: 4, height: 14 }}>
                <div style={{ width: `${(sum / maxCat) * 100}%`, background: T.brass, height: 14, borderRadius: 4 }} />
              </div>
              <div style={{ width: 100, textAlign: "right", fontFamily: T.mono }}>{fmtUSD(sum)}</div>
            </div>
          ))}
        </Panel>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...inputStyle, width: 200 }}>
          {["All", ...EXP_CATEGORIES].map((c) => <option key={c}>{c}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 15 }}>Total: <strong>{fmtUSD(total)}</strong></div>
      </div>

      <Panel>
        {shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.inkSoft }}>No expenses recorded yet.</div>}
        {shown.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${T.lineSoft}`, fontSize: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.inkSoft, width: 86 }}>{e.date}</span>
            <span style={{ flex: 1, minWidth: 140 }}>
              {e.payee || "—"}{e.notes && <span style={{ color: T.inkSoft }}> · {e.notes}</span>}
            </span>
            <span style={{ fontSize: 12, color: T.inkSoft }}>{e.category}</span>
            {!!e.reimbursable && <Badge text={`Reimburse ${e.paid_by || ""}`.trim()} color={T.sage} />}
            <span style={{ fontFamily: T.mono, width: 100, textAlign: "right" }}>{fmtUSD(e.amount)}</span>
            {editable && <Btn kind="danger" small onClick={async () => { await api.del(`/estates/${estateId}/expenses/${e.id}`); refresh(); }}>✕</Btn>}
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ————— Tasks (with assignment) —————
function Tasks({ estateId, tasks, members, refresh, editable }) {
  const phases = ["Immediate", "Probate", "Administration", "Closing"];
  const [newTitle, setNewTitle] = useState("");
  const [newPhase, setNewPhase] = useState("Administration");

  const patch = async (id, body) => { await api.patch(`/estates/${estateId}/tasks/${id}`, body); refresh(); };
  const add = async () => {
    if (!newTitle.trim()) return;
    await api.post(`/estates/${estateId}/tasks`, { title: newTitle.trim(), phase: newPhase, done: 0 });
    setNewTitle("");
    refresh();
  };

  return (
    <div>
      {editable && (
        <Panel style={{ padding: 16, marginBottom: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a task…" onKeyDown={(e) => e.key === "Enter" && add()} />
          <select style={{ ...inputStyle, width: 170 }} value={newPhase} onChange={(e) => setNewPhase(e.target.value)}>
            {phases.map((p) => <option key={p}>{p}</option>)}
          </select>
          <Btn onClick={add}>Add</Btn>
        </Panel>
      )}

      {phases.map((phase) => {
        const list = tasks.filter((t) => t.phase === phase);
        if (list.length === 0) return null;
        const done = list.filter((t) => t.done).length;
        return (
          <Panel key={phase} style={{ marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontFamily: T.serif, fontSize: 17 }}>{phase}</div>
              <div style={{ flex: 1, maxWidth: 200, background: T.lineSoft, borderRadius: 4, height: 8 }}>
                <div style={{ width: `${(done / list.length) * 100}%`, background: T.sage, height: 8, borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 12, color: T.inkSoft }}>{done}/{list.length}</div>
            </div>
            {list.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: `1px solid ${T.lineSoft}`, fontSize: 14, flexWrap: "wrap" }}>
                <input type="checkbox" checked={!!t.done} disabled={!editable} onChange={() => patch(t.id, { done: t.done ? 0 : 1 })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span style={{ flex: 1, minWidth: 160, textDecoration: t.done ? "line-through" : "none", color: t.done ? T.inkSoft : T.ink }}>{t.title}</span>
                <select value={t.assigned_to || ""} disabled={!editable} onChange={(e) => patch(t.id, { assigned_to: e.target.value })}
                  style={{ ...inputStyle, width: 170, padding: "4px 8px", fontSize: 12 }}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.email}>{m.name || m.email}</option>)}
                </select>
                <input type="date" value={t.due || ""} disabled={!editable} onChange={(e) => patch(t.id, { due: e.target.value })} style={{ ...inputStyle, width: 150, padding: "4px 8px", fontSize: 12 }} />
                {editable && <Btn kind="danger" small onClick={async () => { await api.del(`/estates/${estateId}/tasks/${t.id}`); refresh(); }}>✕</Btn>}
              </div>
            ))}
          </Panel>
        );
      })}
    </div>
  );
}

// ————— Documents —————
function Documents({ estateId, docs, refresh, editable }) {
  const [newName, setNewName] = useState("");
  const patch = async (id, body) => { await api.patch(`/estates/${estateId}/documents/${id}`, body); refresh(); };
  const add = async () => {
    if (!newName.trim()) return;
    await api.post(`/estates/${estateId}/documents`, { name: newName.trim(), status: "needed", note: "" });
    setNewName("");
    refresh();
  };
  return (
    <div>
      {editable && (
        <Panel style={{ padding: 16, marginBottom: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a document to track…" onKeyDown={(e) => e.key === "Enter" && add()} />
          <Btn onClick={add}>Add</Btn>
        </Panel>
      )}
      <Panel>
        {docs.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${T.lineSoft}`, fontSize: 14, flexWrap: "wrap" }}>
            <button disabled={!editable} onClick={() => patch(d.id, { status: d.status === "located" ? "needed" : "located" })} style={{
              fontFamily: T.sans, fontSize: 11, fontWeight: 700, cursor: editable ? "pointer" : "default", width: 78,
              padding: "3px 0", borderRadius: 999, border: "none", color: "#fff",
              background: d.status === "located" ? T.sage : "#A8AEA5",
            }}>{d.status === "located" ? "Located" : "Needed"}</button>
            <span style={{ flex: 1, minWidth: 160, color: d.status === "located" ? T.inkSoft : T.ink }}>{d.name}</span>
            <DebouncedNote value={d.note || ""} disabled={!editable} onSave={(note) => patch(d.id, { note })} />
            {editable && <Btn kind="danger" small onClick={async () => { await api.del(`/estates/${estateId}/documents/${d.id}`); refresh(); }}>✕</Btn>}
          </div>
        ))}
      </Panel>
    </div>
  );
}

function DebouncedNote({ value, onSave, disabled }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      style={{ ...inputStyle, width: 240, padding: "4px 8px", fontSize: 12 }}
      value={v} disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      placeholder="Where it is / who has it"
    />
  );
}

// ————— Contacts —————
function Contacts({ estateId, contacts, refresh, editable }) {
  const roles = ["Attorney", "Accountant / CPA", "Appraiser", "Realtor", "Financial advisor", "Court clerk", "Beneficiary", "Other"];
  const blank = { name: "", role: "Attorney", phone: "", email: "", notes: "" };
  const [draft, setDraft] = useState(blank);
  const add = async () => {
    if (!draft.name.trim()) return;
    await api.post(`/estates/${estateId}/contacts`, draft);
    setDraft(blank);
    refresh();
  };
  return (
    <div>
      {editable && (
        <Panel style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ fontFamily: T.serif, fontSize: 18, marginBottom: 14 }}>Add a contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <Field label="Name"><input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Role">
              <select style={inputStyle} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Phone"><input style={inputStyle} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <Field label="Email"><input style={inputStyle} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <input style={{ ...inputStyle, flex: 1 }} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Notes (optional)" />
            <Btn onClick={add}>Save contact</Btn>
          </div>
        </Panel>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {contacts.length === 0 && (
          <Panel style={{ padding: 30, textAlign: "center", color: T.inkSoft, gridColumn: "1 / -1" }}>No contacts yet.</Panel>
        )}
        {contacts.map((c) => (
          <Panel key={c.id} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
              {editable && <Btn kind="danger" small onClick={async () => { await api.del(`/estates/${estateId}/contacts/${c.id}`); refresh(); }}>✕</Btn>}
            </div>
            <div style={{ fontSize: 12, color: T.brass, fontWeight: 600, margin: "2px 0 8px" }}>{c.role}</div>
            {c.phone && <div style={{ fontSize: 13, fontFamily: T.mono }}>{c.phone}</div>}
            {c.email && <div style={{ fontSize: 13, fontFamily: T.mono }}>{c.email}</div>}
            {c.notes && <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>{c.notes}</div>}
          </Panel>
        ))}
      </div>
    </div>
  );
}

// ————— Members & roles —————
function Members({ estateId, members, refresh, isOwner, user }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [error, setError] = useState("");

  const ROLE_HELP = {
    owner: "Full control, including inviting people and deleting the estate.",
    editor: "Can add and change inventory, expenses, tasks, documents, and contacts.",
    viewer: "Read-only. Good for beneficiaries and family who just want visibility.",
  };

  const invite = async () => {
    setError("");
    try {
      await api.post(`/estates/${estateId}/members`, { email, role });
      setEmail("");
      refresh();
    } catch (e) { setError(e.message); }
  };

  const changeRole = async (m, newRole) => {
    setError("");
    try { await api.patch(`/estates/${estateId}/members/${m.id}`, { role: newRole }); refresh(); }
    catch (e) { setError(e.message); }
  };

  const remove = async (m) => {
    setError("");
    try { await api.del(`/estates/${estateId}/members/${m.id}`); refresh(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div>
      {isOwner && (
        <Panel style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ fontFamily: T.serif, fontSize: 18, marginBottom: 6 }}>Invite someone</div>
          <p style={{ fontSize: 13, color: T.inkSoft, marginTop: 0 }}>
            Enter the Google email they sign in with. The estate appears in their list the next time they sign in.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={{ ...inputStyle, flex: 1, minWidth: 220 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
            <select style={{ ...inputStyle, width: 130 }} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="owner">Owner</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Btn onClick={invite}>Invite</Btn>
          </div>
          <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 0 }}>{ROLE_HELP[role]}</p>
          {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 0 }}>{error}</p>}
        </Panel>
      )}

      <Panel>
        {members.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${T.lineSoft}`, flexWrap: "wrap" }}>
            {m.picture
              ? <img src={m.picture} alt="" referrerPolicy="no-referrer" style={{ width: 30, height: 30, borderRadius: "50%" }} />
              : <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.lineSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: T.inkSoft }}>{m.email[0].toUpperCase()}</div>}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {m.name || m.email}{m.email === user.email && <span style={{ color: T.inkSoft, fontWeight: 400 }}> (you)</span>}
              </div>
              <div style={{ fontSize: 12, color: T.inkSoft }}>
                {m.email}{!m.name && " · hasn't signed in yet"}
              </div>
            </div>
            {isOwner ? (
              <>
                <select value={m.role} onChange={(e) => changeRole(m, e.target.value)} style={{ ...inputStyle, width: 110, padding: "4px 8px", fontSize: 13 }}>
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Btn kind="danger" small onClick={() => remove(m)}>Remove</Btn>
              </>
            ) : (
              <Badge text={m.role} color={m.role === "owner" ? T.brass : m.role === "editor" ? T.sage : "#8A8F87"} />
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}
