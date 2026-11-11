export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function formatDuration(d) {
  return typeof d === "number" ? `${d.toFixed(1)}s` : "";
}

export function formatDate(iso) {
  return iso ? iso.slice(0, 10) : "";
}

export function firstLine(msg) {
  const line = (msg || "").split("\n")[0];
  return line.length > 70 ? line.slice(0, 67) + "…" : line;
}

export function normalizeSelectedText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function trimmedSelectionText(text) {
  const normalized = normalizeSelectedText(text);
  return normalized.length > 200 ? `${normalized.slice(0, 197)}…` : normalized;
}

export function hashValue(value) {
  return value == null ? "" : String(value);
}

export function selectorValue(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
