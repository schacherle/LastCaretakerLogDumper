import { hashValue, normalizeSelectedText, trimmedSelectionText, selectorValue } from "../core/formatters.js";
import { state, currentSelectedEntryKey, SCOPE_TITLES } from "./store.js";

export function shortSha(sha) {
  return String(sha || "").slice(0, 7);
}

export function buildBrowseHash(extra = {}) {
  const params = new URLSearchParams();
  params.set("mode", "browse");
  params.set("scope", state.browseScope);
  if (state.currentBrowseSha) params.set("version", shortSha(state.currentBrowseSha));
  const entryKey = hashValue(currentSelectedEntryKey());
  if (entryKey) params.set("entry", entryKey);
  if (state.browseScope === "sampledata") params.set("sampleScope", state.sampleScope);
  if (extra.page) params.set("page", extra.page);
  if (extra.text) params.set("text", extra.text);
  if (state.browseScope === "sampledata" && state.unlockedSamples.has(entryKey)) params.set("unlocked", "1");
  return params.toString();
}

export function writeBrowseHash(extra = {}) {
  if (state.isApplyingHashState || state.currentMode !== "browse") return;
  const hash = buildBrowseHash(extra);
  const suffix = hash ? `#${hash}` : "";
  history.replaceState(null, "", `${location.pathname}${location.search}${suffix}`);
}

export function parseBrowseHash() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if ((params.get("mode") || "browse") !== "browse") return null;
  const scope = params.get("scope");
  return {
    scope: SCOPE_TITLES[scope] ? scope : "logs",
    version: params.get("version") || "",
    entry: params.get("entry") || "",
    page: params.get("page") || "",
    text: trimmedSelectionText(params.get("text") || ""),
    sampleScope: params.get("sampleScope") || "all",
    unlocked: params.get("unlocked") === "1",
  };
}

export function browseShareUrl(extra = {}) {
  const hash = buildBrowseHash(extra);
  return `${location.origin}${location.pathname}${location.search}#${hash}`;
}

export function getActiveDetailPane() {
  return state.browseScope === "sampledata"
    ? document.getElementById("sampledata-detail-pane")
    : document.getElementById("detail-pane");
}

export function findTextNodeMatch(root, snippet) {
  const needle = normalizeSelectedText(snippet).toLowerCase();
  if (!root || !needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = node.nodeValue || "";
    let normalized = "";
    const rawIndices = [];
    let pendingSpace = false;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (/\s/.test(ch)) {
        pendingSpace = normalized.length > 0;
        continue;
      }
      if (pendingSpace) {
        normalized += " ";
        rawIndices.push(i);
        pendingSpace = false;
      }
      normalized += ch;
      rawIndices.push(i);
    }
    normalized = normalized.toLowerCase();
    const idx = normalized.indexOf(needle);
    if (idx === -1) continue;
    const rawStart = rawIndices[idx];
    const rawEnd = rawIndices[idx + needle.length - 1];
    if (rawStart != null && rawEnd != null) return { node, start: rawStart, end: rawEnd + 1 };
  }
  return null;
}

export function clearLinkedTextMarks(root) {
  if (!root) return;
  root.querySelectorAll("mark.link-mark").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function highlightLinkedText(root, text) {
  clearLinkedTextMarks(root);
  const match = findTextNodeMatch(root, text);
  if (!match) return false;
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);
  const mark = document.createElement("mark");
  mark.className = "link-mark";
  range.surroundContents(mark);
  mark.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

export function focusBrowseHashTarget(targetState) {
  const pane = getActiveDetailPane();
  if (!pane) return;
  let target = pane;
  if (targetState.page) {
    const el = pane.querySelector(`[data-link-page="${selectorValue(targetState.page)}"]`);
    if (el) target = el;
  }
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (targetState.text) highlightLinkedText(target, targetState.text) || highlightLinkedText(pane, targetState.text);
}
