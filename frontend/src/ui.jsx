import React from "react";

export const T = {
  bg: "#F2F3EF",
  panel: "#FFFFFF",
  ink: "#22332E",
  inkSoft: "#5C6B64",
  line: "#D9DDD5",
  lineSoft: "#E8EAE4",
  brass: "#9A7B3F",
  sage: "#5E7367",
  danger: "#9A4A3F",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

export const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);

export const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14,
  fontFamily: T.sans, color: T.ink, background: "#FBFBF9",
  border: `1px solid ${T.line}`, borderRadius: 6, outline: "none",
};

export const Label = ({ children }) => (
  <div style={{ fontFamily: T.sans, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkSoft, marginBottom: 4 }}>{children}</div>
);

export const Field = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}><Label>{label}</Label>{children}</div>
);

export const Btn = ({ children, onClick, kind = "primary", small, style, disabled }) => {
  const base = {
    fontFamily: T.sans, fontSize: small ? 12 : 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    padding: small ? "5px 10px" : "9px 16px", borderRadius: 6, border: "1px solid transparent",
  };
  const kinds = {
    primary: { background: T.ink, color: "#fff" },
    ghost: { background: "transparent", color: T.ink, border: `1px solid ${T.line}` },
    danger: { background: "transparent", color: T.danger, border: `1px solid ${T.line}` },
  };
  return <button disabled={disabled} onClick={onClick} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
};

export const Badge = ({ text, color }) => (
  <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: "#fff", background: color, padding: "2px 8px", borderRadius: 999 }}>{text}</span>
);

export const Panel = ({ children, style }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, ...style }}>{children}</div>
);

export const STATUS_COLOR = {
  Undecided: "#8A8F87", Keep: "#5E7367", Sell: "#9A7B3F", Donate: "#6B7FA3", Distribute: "#7A5C8A",
};

export const INV_CATEGORIES = ["Furniture", "Jewelry", "Vehicles", "Art & Collectibles", "Electronics", "Tools", "Real Estate", "Financial", "Household", "Other"];
export const INV_STATUSES = ["Undecided", "Keep", "Sell", "Donate", "Distribute"];
export const EXP_CATEGORIES = ["Legal & Court", "Funeral", "Utilities", "Maintenance & Repairs", "Taxes", "Appraisal", "Travel", "Other"];
