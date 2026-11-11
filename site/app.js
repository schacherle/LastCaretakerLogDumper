"use strict";

// GitHub Pages project sites are always served as https://<owner>.github.io/<repo>/,
// so the repo this site should read from can be read straight off the URL instead of
// hardcoded -- the same app.js works unmodified on any fork's Pages deployment. Falls
// back to this repo for local testing (file://, localhost) where that pattern doesn't apply.
/**
 * Determines the target GitHub repository (owner/repo) based on URL params or Pages hostname.
 *
 * Checks for a '?repo=' query parameter override first, then matches against
 * '<owner>.github.io/<repo>/'. Returns null if not detected.
 *
 * @returns {string|null} The GitHub 'owner/repo' identifier or null if undetermined.
 */
function detectRepo() {
  const override = new URLSearchParams(location.search).get("repo");
  if (override) return override;
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const repoName = m && location.pathname.split("/").filter(Boolean)[0];
  return m && repoName ? `${m[1]}/${repoName}` : null;
}

const REPO = detectRepo();
const PATHS = {
  logs: "voyage_logs_dump.json",
  subtitles: "voyage_quest_subtitles_dump.json",
  sampleText: "voyage_sampledata_text_dump.json",
  sampleData: "site/sampledata/data.json",
  sampleImagesDir: "sampledata_images",
};

const fileCache = new Map(); // `${sha}:${path}` -> parsed json | null (missing)

let versions = []; // [{ sha, message, date }], newest first
let currentBrowseSha = null; // sha of the version currently loaded in Browse mode
let currentBrowseLogs = [];
let currentBrowseSubs = [];
let filteredLogs = [];
let filteredSubGroups = [];

let currentMode = "browse"; // "browse" | "compare"
let browseScope = "logs"; // "logs" | "subtitles" | "sampledata"
let compareScope = "logs"; // "logs" | "subtitles" | "sampledata"
let selectedLogIdx = -1;
let selectedSubIdx = -1; // indexes filteredSubGroups
let selectedLogKey = null;
let selectedSubKey = null;

let sampleData = []; // reloaded per-version by loadBrowseVersion(), like currentBrowseLogs/Subs
let filteredSamples = [];
let sampleScope = "all"; // "all" | "field" | "cave"
let selectedSampleIdx = -1;
let selectedSampleKey = null;
const unlockedSamples = new Set();

let activeSelectionContext = null;

let isApplyingHashState = false;

let displayOn = true;
let brt = 100, con = 100, sat = 100;

// ---------- helpers ----------

/**
 * Escapes special HTML characters in a string to prevent XSS injection.
 *
 * @param {string|number|null|undefined} str - The raw string or value to escape.
 * @returns {string} Sanitized string with HTML entities escaped.
 */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Formats a duration in seconds into a single-decimal-place string representation.
 *
 * @param {number|null|undefined} d - Duration in seconds.
 * @returns {string} Formatted duration string (e.g. '1.5s') or empty string if invalid.
 */
function formatDuration(d) {
  return typeof d === "number" ? `${d.toFixed(1)}s` : "";
}

/**
 * Extracts the YYYY-MM-DD date prefix from an ISO timestamp string.
 *
 * @param {string|null|undefined} iso - ISO date-time string.
 * @returns {string} Date string in YYYY-MM-DD format, or empty string.
 */
function formatDate(iso) {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Extracts and truncates the first line of a multiline git commit message.
 *
 * @param {string|null|undefined} msg - Full git commit message.
 * @returns {string} The first line, truncated to 70 characters with an ellipsis if longer.
 */
function firstLine(msg) {
  const line = (msg || "").split("\n")[0];
  return line.length > 70 ? line.slice(0, 67) + "…" : line;
}

/**
 * Retrieves the current raw value entered in the terminal filter input element.
 *
 * @returns {string} Current filter text, or empty string if element is missing.
 */
function currentFilterValue() {
  return document.getElementById("filter-input")?.value || "";
}

/**
 * Normalizes whitespace in user-selected text by collapsing consecutive spaces and trimming edges.
 *
 * @param {string|null|undefined} text - Raw selection text.
 * @returns {string} Cleaned and whitespace-collapsed text.
 */
function normalizeSelectedText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * Normalizes selection text and truncates it to a maximum of 200 characters for deep linking.
 *
 * @param {string|null|undefined} text - Raw selection text.
 * @returns {string} Truncated and normalized selection text.
 */
function trimmedSelectionText(text) {
  const normalized = normalizeSelectedText(text);
  return normalized.length > 200 ? `${normalized.slice(0, 197)}…` : normalized;
}

/**
 * Converts a value to a safe string representation for URL hash query parameters.
 *
 * @param {*} value - The value to convert.
 * @returns {string} String representation or empty string if null or undefined.
 */
function hashValue(value) {
  return value == null ? "" : String(value);
}

/**
 * Escapes a string for safe usage in CSS query selectors, falling back to regex escaping if CSS.escape is unavailable.
 *
 * @param {*} value - The attribute value or identifier to escape.
 * @returns {string} CSS-escaped selector string.
 */
function selectorValue(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

/**
 * Updates DOM visibility classes and headers when switching browse scope.
 *
 * @param {'logs'|'subtitles'|'sampledata'} scope - The newly active content category.
 */
function setBrowseModeUi(scope) {
  const title = document.getElementById("list-screen-title");
  document.querySelectorAll("#browse-content-tabs .content-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.content === scope);
  });
  document.getElementById("logs-list").classList.toggle("hidden", scope !== "logs");
  document.getElementById("subs-list").classList.toggle("hidden", scope !== "subtitles");
  document.getElementById("sampledata-list").classList.toggle("hidden", scope !== "sampledata");
  document.getElementById("detail-pane").classList.toggle("hidden", scope === "sampledata");
  document.getElementById("sampledata-detail-pane").classList.toggle("hidden", scope !== "sampledata");
  document.getElementById("sampledata-content-tabs").classList.toggle("hidden", scope !== "sampledata");
  title.textContent = SCOPE_TITLES[scope];
}

/**
 * Updates active class styling on sample data subcategory filter tabs.
 *
 * @param {'all'|'field'|'cave'} scope - Subcategory filter to activate.
 */
function setSampleScopeUi(scope) {
  document.querySelectorAll("#sampledata-content-tabs .content-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.content === scope);
  });
}

/**
 * Switches the active Browse mode content scope (logs, subtitles, or sample data) and refreshes views.
 *
 * @param {'logs'|'subtitles'|'sampledata'} scope - Target content category.
 * @param {object} [options={}] - Options object.
 * @param {boolean} [options.resetFilter=true] - Whether to clear the terminal filter input.
 */
function applyBrowseScope(scope, options = {}) {
  if (!SCOPE_TITLES[scope]) return;
  const { resetFilter = true } = options;
  browseScope = scope;
  setBrowseModeUi(scope);

  const filterInput = document.getElementById("filter-input");
  if (resetFilter) filterInput.value = "";
  filterInput.placeholder = browseScope === "sampledata" ? "type to filter sample data…" : "type to filter…";

  renderBrowseLogs(currentFilterValue());
  renderBrowseSubs(currentFilterValue());
  renderSampleList(currentFilterValue());
  updateCopyLinkButton();
}

/**
 * Switches the sample data subcategory filter ('all', 'field', or 'cave') and re-renders the list.
 *
 * @param {'all'|'field'|'cave'} scope - Target subcategory filter.
 * @param {object} [options={}] - Options object.
 * @param {boolean} [options.resetFilter=true] - Whether to clear the terminal filter input.
 */
function applySampleScope(scope, options = {}) {
  if (!["all", "field", "cave"].includes(scope)) return;
  const { resetFilter = true } = options;
  sampleScope = scope;
  setSampleScopeUi(scope);
  if (resetFilter) document.getElementById("filter-input").value = "";
  renderSampleList(currentFilterValue());
}

/**
 * Retrieves the unique identifier or key of the currently selected entry in Browse mode.
 *
 * @returns {string|null} Active entry key (log id, subtitle group key, or sample id).
 */
function currentSelectedEntryKey() {
  if (browseScope === "logs") return selectedLogKey;
  if (browseScope === "subtitles") return selectedSubKey;
  return selectedSampleKey;
}

/**
 * Retrieves the currently selected item object from the filtered collection in Browse mode.
 *
 * @returns {object|null} Active entry object or null if none is selected.
 */
function currentSelectedEntry() {
  if (browseScope === "logs") return filteredLogs[selectedLogIdx] || null;
  if (browseScope === "subtitles") return filteredSubGroups[selectedSubIdx] || null;
  return filteredSamples[selectedSampleIdx] || null;
}

/**
 * Generates an anchor page key for a voyage log fragment.
 *
 * @param {object|null} fragment - The voyage log fragment object.
 * @param {number} index - Index of the fragment in the parent log.
 * @returns {string} Unique page key in 'page:<id>' or 'page:<index>' format.
 */
function logPageKey(fragment, index) {
  return fragment && fragment.id ? `page:${fragment.id}` : `page:${index + 1}`;
}

/**
 * Generates an anchor page key for a quest subtitle dialogue line.
 *
 * @param {object|null} item - Subtitle item object.
 * @returns {string} Unique part key in 'part:<Name>' format.
 */
function subtitlePageKey(item) {
  return `part:${item?.Name || ""}`;
}

/**
 * Returns the currently active detail pane DOM element based on active browse scope.
 *
 * @returns {HTMLElement|null} The DOM element for the active detail pane.
 */
function getActiveDetailPane() {
  return browseScope === "sampledata"
    ? document.getElementById("sampledata-detail-pane")
    : document.getElementById("detail-pane");
}

/**
 * Truncates a 40-character git commit SHA to its 7-character short form.
 *
 * @param {string|null|undefined} sha - Full git commit SHA.
 * @returns {string} Short 7-character commit SHA.
 */
function shortSha(sha) {
  return String(sha || "").slice(0, 7);
}

/**
 * Resolves a full or abbreviated git commit SHA against known repository versions.
 *
 * @param {string} version - Exact or prefix git commit SHA.
 * @returns {string} Full 40-character SHA if resolved, or empty string.
 */
function resolveVersionSha(version) {
  if (!version) return "";
  const exact = versions.find((v) => v.sha === version);
  if (exact) return exact.sha;
  const matches = versions.filter((v) => v.sha.startsWith(version));
  return matches.length === 1 ? matches[0].sha : "";
}

/**
 * Constructs the URL hash string representing the current Browse mode navigation state.
 *
 * @param {object} [extra={}] - Additional deep-link state properties.
 * @param {string} [extra.page] - Target fragment or dialogue line page key.
 * @param {string} [extra.text] - Selected text snippet to highlight.
 * @returns {string} Serialized URLSearchParams query string for the hash.
 */
function buildBrowseHash(extra = {}) {
  const params = new URLSearchParams();
  params.set("mode", "browse");
  params.set("scope", browseScope);
  if (currentBrowseSha) params.set("version", shortSha(currentBrowseSha));
  const entryKey = hashValue(currentSelectedEntryKey());
  if (entryKey) params.set("entry", entryKey);
  if (browseScope === "sampledata") params.set("sampleScope", sampleScope);
  if (extra.page) params.set("page", extra.page);
  if (extra.text) params.set("text", extra.text);
  if (browseScope === "sampledata" && unlockedSamples.has(entryKey)) params.set("unlocked", "1");
  return params.toString();
}

/**
 * Replaces the browser URL hash with serialized Browse mode state without triggering page scroll.
 *
 * @param {object} [extra={}] - Additional deep-link state properties.
 */
function writeBrowseHash(extra = {}) {
  if (isApplyingHashState || currentMode !== "browse") return;
  const hash = buildBrowseHash(extra);
  const suffix = hash ? `#${hash}` : "";
  history.replaceState(null, "", `${location.pathname}${location.search}${suffix}`);
}

/**
 * Parses and validates the current window location hash into structured Browse mode state.
 *
 * @returns {object|null} Parsed state object or null if hash is empty or not in browse mode.
 */
function parseBrowseHash() {
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

/**
 * Scrolls the currently selected entry element in the active master list into view.
 */
function scrollSelectedEntryIntoView() {
  if (browseScope === "logs") document.querySelector("#logs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  else if (browseScope === "subtitles") document.querySelector("#subs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  else document.querySelector("#sampledata-list .entry.selected")?.scrollIntoView({ block: "nearest" });
}

/**
 * Clears any active DOM text selection ranges in the browser window.
 */
function clearCopiedSelection() {
  const selection = window.getSelection();
  if (selection && typeof selection.removeAllRanges === "function") selection.removeAllRanges();
}

/**
 * Searches a DOM subtree using TreeWalker for a text node containing the target snippet across normalized whitespace.
 *
 * @param {Node} root - Root DOM element to search within.
 * @param {string} snippet - Text snippet to match.
 * @returns {{ node: Text, start: number, end: number }|null} Matched text node and index offsets, or null.
 */
function findTextNodeMatch(root, snippet) {
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

/**
 * Removes all linked text highlight `<mark>` elements within the given root element, unwrapping child text.
 *
 * @param {HTMLElement|null} root - Root container element.
 */
function clearLinkedTextMarks(root) {
  if (!root) return;
  root.querySelectorAll("mark.link-mark").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

/**
 * Finds a matching text snippet in the DOM container, wraps it in a `<mark class="link-mark">`, and scrolls it into view.
 *
 * @param {HTMLElement|null} root - Root DOM element to search.
 * @param {string} text - Text snippet to highlight.
 * @returns {boolean} True if a match was found and highlighted, false otherwise.
 */
function highlightLinkedText(root, text) {
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

/**
 * Scrolls to a targeted page section or highlights specific linked text in the detail pane based on parsed hash state.
 *
 * @param {object} state - Parsed browse hash state object containing page and text properties.
 */
function focusBrowseHashTarget(state) {
  const pane = getActiveDetailPane();
  if (!pane) return;
  let target = pane;
  if (state.page) {
    const el = pane.querySelector(`[data-link-page="${selectorValue(state.page)}"]`);
    if (el) target = el;
  }
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (state.text) highlightLinkedText(target, state.text) || highlightLinkedText(pane, state.text);
}

/**
 * Extracts active text selection context from the detail screen including enclosing fragment page key and trimmed text.
 *
 * @returns {{ page: string, text: string }|null} Selection context object or null if invalid or collapsed.
 */
function getDetailSelectionContext() {
  if (currentMode !== "browse") return null;
  const pane = getActiveDetailPane();
  const selection = window.getSelection();
  if (!pane || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!container || !pane.contains(container)) return null;

  const text = trimmedSelectionText(selection.toString());
  if (!text) return null;
  const pageEl = container.closest("[data-link-page]");
  return {
    page: pageEl?.dataset.linkPage || "",
    text,
  };
}

/**
 * Generates an absolute shareable URL including the current origin, path, and encoded Browse mode hash parameters.
 *
 * @param {object} [extra={}] - Additional hash state parameters to include.
 * @returns {string} Absolute shareable URL string.
 */
function browseShareUrl(extra = {}) {
  const hash = buildBrowseHash(extra);
  return `${location.origin}${location.pathname}${location.search}#${hash}`;
}

/**
 * Generates an absolute shareable deep-link URL pointing to the currently selected master entry.
 *
 * @returns {string} Absolute deep-link URL.
 */
function currentEntryShareUrl() {
  return browseShareUrl();
}

/**
 * Generates an absolute shareable deep-link URL pointing to the active text selection or context in the detail screen.
 *
 * @returns {string} Absolute deep-link URL targeting the selected text snippet.
 */
function currentSelectionShareUrl() {
  return browseShareUrl(activeSelectionContext || getDetailSelectionContext() || {});
}

/**
 * Copies plain text to the system clipboard using the modern Clipboard API with fallback to textarea execCommand.
 *
 * @param {string} text - Text string to copy to the clipboard.
 * @returns {Promise<void>} Resolves when text is copied.
 */
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "readonly");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

/**
 * Updates the disabled state and label of the terminal 'COPY ENTRY LINK' button.
 */
function updateCopyLinkButton() {
  const btn = document.getElementById("copy-link-btn");
  if (!btn) return;
  const entryKey = currentSelectedEntryKey();
  btn.disabled = currentMode !== "browse" || !entryKey;
  btn.textContent = "COPY ENTRY LINK";
}

/**
 * Hides the floating text selection link button and clears active selection context.
 */
function hideSelectionLinkButton() {
  activeSelectionContext = null;
  document.getElementById("selection-link-btn")?.classList.add("hidden");
}

/**
 * Determines the target bounding rectangle for positioning the floating link button next to a selection range.
 *
 * @param {Range} range - DOM selection Range.
 * @returns {DOMRect} Bounding client rect.
 */
function selectionButtonRect(range) {
  const rects = Array.from(range.getClientRects());
  return rects[rects.length - 1] || range.getBoundingClientRect();
}

/**
 * Restricts a numeric value to a specified minimum and maximum boundary.
 *
 * @param {number} value - Input number.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @returns {number} Clamped number.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Repositions and displays the floating 🔗 link button adjacent to the active text selection in the detail pane.
 */
function updateSelectionLinkButton() {
  const btn = document.getElementById("selection-link-btn");
  if (!btn) return;
  const selection = window.getSelection();
  const context = getDetailSelectionContext();
  if (currentMode !== "browse" || !context || !selection || selection.rangeCount === 0) {
    hideSelectionLinkButton();
    return;
  }

  activeSelectionContext = context;
  const rect = selectionButtonRect(selection.getRangeAt(0));
  if (!rect || (!rect.width && !rect.height)) {
    hideSelectionLinkButton();
    return;
  }

  btn.classList.remove("hidden");
  const margin = 10;
  const width = btn.offsetWidth;
  const height = btn.offsetHeight;
  const left = clamp(rect.right - width / 2, margin, window.innerWidth - width - margin);
  const top = clamp(rect.bottom + 8, margin, window.innerHeight - height - margin);
  btn.style.left = `${left}px`;
  btn.style.top = `${top}px`;
}

/**
 * Synchronizes the URL hash and button states with the currently selected entry and text context.
 */
function syncBrowseSelectionHash() {
  writeBrowseHash();
  updateCopyLinkButton();
  updateSelectionLinkButton();
}

/**
 * Selects an entry in the specified scope by its unique key and re-renders lists.
 *
 * @param {'logs'|'subtitles'|'sampledata'} scope - Content scope.
 * @param {string} key - Unique entry key to select.
 * @returns {boolean} True if the entry was found and selected, false otherwise.
 */
function selectBrowseEntryByKey(scope, key) {
  if (!key) return false;
  if (scope === "logs") {
    selectedLogKey = key;
    renderBrowseLogs(currentFilterValue());
    return !!filteredLogs[selectedLogIdx] && filteredLogs[selectedLogIdx].id === key;
  }
  if (scope === "subtitles") {
    selectedSubKey = key;
    renderBrowseSubs(currentFilterValue());
    return !!filteredSubGroups[selectedSubIdx] && filteredSubGroups[selectedSubIdx].key === key;
  }
  selectedSampleKey = key;
  renderSampleList(currentFilterValue());
  return !!filteredSamples[selectedSampleIdx] && filteredSamples[selectedSampleIdx].id === key;
}

/**
 * Reads the current URL hash fragment and applies mode, scope, version, entry selection, and text highlighting.
 *
 * @returns {Promise<boolean>} Resolves to true if a valid browse hash was parsed and applied, false otherwise.
 */
async function applyBrowseHashState() {
  const state = parseBrowseHash();
  if (!state) return false;

  isApplyingHashState = true;
  try {
    setMode("browse");
    applyBrowseScope(state.scope, { resetFilter: true });
    if (state.scope === "sampledata") applySampleScope(state.sampleScope, { resetFilter: false });

    const browseSelect = document.getElementById("browse-version");
  const version = resolveVersionSha(state.version) || browseSelect.value;
    if (browseSelect.value !== version) browseSelect.value = version;
    if (currentBrowseSha !== version) await loadBrowseVersion(version);

    if (state.scope === "sampledata" && state.unlocked && state.entry) unlockedSamples.add(state.entry);
    if (state.entry) selectBrowseEntryByKey(state.scope, state.entry);
    scrollSelectedEntryIntoView();
    if (state.page || state.text) requestAnimationFrame(() => focusBrowseHashTarget(state));
    updateCopyLinkButton();
    return true;
  } finally {
    isApplyingHashState = false;
  }
}

/**
 * Displays or clears status and error messages in the terminal status overlay bar.
 *
 * @param {string} text - Message text to display, or empty string to hide status.
 * @param {boolean} [isError=false] - Whether this status represents an error.
 */
function setStatus(text, isError) {
  const el = document.getElementById("status");
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", !!isError);
}

/**
 * Decodes a raw ArrayBuffer into a JavaScript string, handling UTF-16 LE/BE and UTF-8 BOM encodings.
 *
 * @param {ArrayBuffer} buf - Raw binary buffer from network response.
 * @returns {string} Decoded string content.
 */
function decodeArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.slice(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf.slice(2));
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf.slice(3));
  }
  return new TextDecoder("utf-8").decode(buf);
}

/**
 * Fetches a raw file from GitHub at a specific commit SHA with in-memory caching and BOM-aware decoding.
 *
 * @param {string} path - Repository relative file path.
 * @param {string} sha - 40-character git commit SHA.
 * @returns {Promise<*|null>} Parsed JSON content or null if 404 Not Found.
 * @throws {Error} If network request fails with a status other than 404.
 */
async function fetchFileAtSha(path, sha) {
  const key = `${sha}:${path}`;
  if (fileCache.has(key)) return fileCache.get(key);
  const url = `https://raw.githubusercontent.com/${REPO}/${sha}/${path}`;
  const res = await fetch(url);
  if (res.status === 404) {
    fileCache.set(key, null);
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path} @ ${sha.slice(0, 7)} (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  const json = JSON.parse(decodeArrayBuffer(buf));
  fileCache.set(key, json);
  return json;
}

/**
 * Normalizes voyage log dump JSON structures into a consistent object containing buildNumber and logs array.
 *
 * @param {Array|object|null} json - Raw parsed JSON data from voyage_logs_dump.json.
 * @returns {{ buildNumber: number|string|null, logs: Array<object> }} Normalized logs data.
 */
function normalizeLogs(json) {
  if (!json) return { buildNumber: null, logs: [] };
  if (Array.isArray(json)) return { buildNumber: null, logs: json };
  return { buildNumber: json.build_number || null, logs: json.data || [] };
}

/**
 * Normalizes raw JSON dump data that may be wrapped in an object `{ data: [...] }` or returned directly as an array.
 *
 * @param {Array|object|null} json - Raw parsed JSON data.
 * @returns {Array<object>} Array of items.
 */
function normalizeArrayJson(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.data || [];
}

// Subtitle names encode "<storyline>-<part>", e.g. "CU3_3-1" .. "CU3_3-6" are six
// lines of the same storyline (CU3 = Concurrent Update 3, "3" = story index).
// Part suffixes aren't always plain integers (e.g. "-1a", "-2_Anna_B"), so only the
// leading digits are used for ordering within a group.
const SUBTITLE_PART_RE = /^(.*)-(\d.*)$/;

/**
 * Extracts the storyline group key from a quest subtitle asset name (e.g. 'CU3_3' from 'CU3_3-1').
 *
 * @param {string|null|undefined} name - Asset Name string.
 * @returns {string} Group identifier key.
 */
function subtitleGroupKey(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[1] : (name || "");
}

/**
 * Extracts the part label suffix from a quest subtitle asset name (e.g. '1' from 'CU3_3-1').
 *
 * @param {string|null|undefined} name - Asset Name string.
 * @returns {string} Part label string.
 */
function subtitlePartLabel(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[2] : "";
}

/**
 * Parses the leading numeric index from a subtitle part label for numerical sorting.
 *
 * @param {string|null|undefined} name - Asset Name string.
 * @returns {number} Integer part number, or 0 if unparseable.
 */
function subtitlePartNumber(name) {
  const n = parseInt(subtitlePartLabel(name), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Groups flat quest subtitle records by storyline prefix and calculates total duration per storyline.
 *
 * @param {Array<object>} subs - Flat array of subtitle dialogue objects.
 * @returns {Array<{ key: string, items: Array<object>, totalDuration: number }>} Grouped subtitle storylines.
 */
function groupSubtitles(subs) {
  const order = [];
  const byKey = new Map();
  for (const s of subs) {
    const key = subtitleGroupKey(s.Name);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key).push(s);
  }
  return order.map((key) => {
    const items = byKey.get(key).slice().sort((a, b) => subtitlePartNumber(a.Name) - subtitlePartNumber(b.Name));
    const totalDuration = items.reduce((sum, s) => sum + (s.Duration || 0), 0);
    return { key, items, totalDuration };
  });
}

// ---------- commit history ----------

/**
 * Queries GitHub REST API to retrieve full commit history touching a specific repository file path.
 *
 * @param {string} path - Relative repository path to query history for.
 * @returns {Promise<Array<{ sha: string, message: string, date: string }>>} List of commit summary objects.
 * @throws {Error} If GitHub API request fails.
 */
async function fetchCommitsForPath(path) {
  const commits = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=100&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to list commits for ${path} (${res.status})`);
    const data = await res.json();
    for (const c of data) {
      commits.push({
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.author?.date || c.commit.committer?.date,
      });
    }
    if (data.length < 100) break;
  }
  return commits;
}

/**
 * Aggregates and deduplicates commit history across all tracked data files, sorted newest to oldest.
 *
 * @returns {Promise<Array<{ sha: string, message: string, date: string }>>} Sorted list of version commits.
 */
async function buildVersionList() {
  const [logCommits, subCommits, sampleTextCommits, sampleDataCommits] = await Promise.all([
    fetchCommitsForPath(PATHS.logs),
    fetchCommitsForPath(PATHS.subtitles),
    fetchCommitsForPath(PATHS.sampleText),
    fetchCommitsForPath(PATHS.sampleData),
  ]);
  const bySha = new Map();
  for (const c of [...logCommits, ...subCommits, ...sampleTextCommits, ...sampleDataCommits]) {
    if (!bySha.has(c.sha)) bySha.set(c.sha, c);
  }
  return [...bySha.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Populates HTML select dropdown elements for Browse and Compare mode versions.
 */
function populateVersionSelects() {
  const optionsHtml = versions
    .map((v) => `<option value="${v.sha}">${escapeHtml(formatDate(v.date))} · ${escapeHtml(firstLine(v.message))} (${v.sha.slice(0, 7)})</option>`)
    .join("");
  for (const id of ["browse-version", "compare-from", "compare-to"]) {
    document.getElementById(id).innerHTML = optionsHtml;
  }
  document.getElementById("browse-version").value = versions[0].sha;
  document.getElementById("compare-to").value = versions[0].sha;
  document.getElementById("compare-from").value = (versions[1] || versions[0]).sha;
}

// ---------- browse: master list rendering ----------

/**
 * Generates the HTML template string for a single entry row in a master list screen.
 *
 * @param {number} idx - Index of the entry in the filtered array.
 * @param {string} title - Entry display title.
 * @param {string} badge - Secondary metadata badge text (e.g. page count).
 * @param {boolean} isSelected - Whether the entry is currently selected.
 * @returns {string} Rendered HTML string.
 */
function entryRowHtml(idx, title, badge, isSelected) {
  return `<div class="entry ${isSelected ? "selected" : ""}" data-idx="${idx}">
    <span class="entry-title">${escapeHtml(title) || "<em>(untitled)</em>"}</span>
    <span class="entry-badge">${escapeHtml(badge)}</span>
  </div>`;
}

/**
 * Filters and renders voyage log items in the Browse mode master list screen.
 *
 * @param {string} filterText - Search query string.
 */
function renderBrowseLogs(filterText) {
  const term = (filterText || "").toLowerCase();
  filteredLogs = currentBrowseLogs.filter(
    (l) => !term || (l.title || "").toLowerCase().includes(term) || (l.id || "").toLowerCase().includes(term)
  );
  if (selectedLogKey) {
    const matchIdx = filteredLogs.findIndex((l) => l.id === selectedLogKey);
    if (matchIdx !== -1) selectedLogIdx = matchIdx;
  }
  if (selectedLogIdx >= filteredLogs.length) selectedLogIdx = filteredLogs.length ? 0 : -1;
  if (selectedLogIdx === -1 && filteredLogs.length) selectedLogIdx = 0;
  selectedLogKey = filteredLogs[selectedLogIdx]?.id || null;

  const container = document.getElementById("logs-list");
  container.innerHTML = filteredLogs.length
    ? filteredLogs
        .map((l, i) => {
          const count = (l.fragments || []).length;
          return entryRowHtml(i, l.title, `${count} ${count === 1 ? "PAGE" : "PAGES"}`, i === selectedLogIdx);
        })
        .join("")
    : `<p class="empty-note">No logs match your filter.</p>`;

  if (browseScope === "logs") {
    document.getElementById("list-count").textContent = `${filteredLogs.length}/${currentBrowseLogs.length}`;
    renderDetail();
    syncBrowseSelectionHash();
  }
}

/**
 * Filters and renders quest subtitle storyline groups in the Browse mode master list screen.
 *
 * @param {string} filterText - Search query string.
 */
function renderBrowseSubs(filterText) {
  const term = (filterText || "").toLowerCase();
  const groups = groupSubtitles(currentBrowseSubs);
  filteredSubGroups = !term
    ? groups
    : groups.filter(
        (g) =>
          g.key.toLowerCase().includes(term) ||
          g.items.some((s) => (s.Name || "").toLowerCase().includes(term) || (s.Subtitle || "").toLowerCase().includes(term))
      );
  if (selectedSubKey) {
    const matchIdx = filteredSubGroups.findIndex((g) => g.key === selectedSubKey);
    if (matchIdx !== -1) selectedSubIdx = matchIdx;
  }
  if (selectedSubIdx >= filteredSubGroups.length) selectedSubIdx = filteredSubGroups.length ? 0 : -1;
  if (selectedSubIdx === -1 && filteredSubGroups.length) selectedSubIdx = 0;
  selectedSubKey = filteredSubGroups[selectedSubIdx]?.key || null;

  const container = document.getElementById("subs-list");
  container.innerHTML = filteredSubGroups.length
    ? filteredSubGroups
        .map((g, i) => {
          const count = g.items.length;
          return entryRowHtml(i, g.key, `${count} ${count === 1 ? "LINE" : "LINES"}`, i === selectedSubIdx);
        })
        .join("")
    : `<p class="empty-note">No subtitles match your filter.</p>`;

  if (browseScope === "subtitles") {
    document.getElementById("list-count").textContent = `${filteredSubGroups.length}/${groups.length}`;
    renderDetail();
    syncBrowseSelectionHash();
  }
}

// ---------- browse: detail pane rendering ----------

/**
 * Renders the full details and fragments of the currently selected voyage log in the detail screen.
 */
function renderLogDetail() {
  const pane = document.getElementById("detail-pane");
  const log = filteredLogs[selectedLogIdx];
  if (!log) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  const fragments = (log.fragments || [])
    .map(
      (f, index) => `<div class="fragment" data-link-page="${escapeHtml(logPageKey(f, index))}">
        <div class="fragment-title">${escapeHtml(f.title)}</div>
        <p>${escapeHtml(f.description)}</p>
      </div>`
    )
    .join("");
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(log.title) || "(untitled)"} ${selectedLogIdx + 1}/${filteredLogs.length}</div>
    <div class="detail-head-2">${escapeHtml(log.id)}</div>
    ${log.description ? `<p class="detail-intro" data-link-page="intro">${escapeHtml(log.description)}</p>` : ""}
    ${fragments}
    ${log.footer ? `<p class="footer-text" data-link-page="footer">${escapeHtml(log.footer)}</p>` : ""}
  `;
}

/**
 * Renders the dialogue sequence lines and duration metrics of the selected quest subtitle group.
 */
function renderSubDetail() {
  const pane = document.getElementById("detail-pane");
  const group = filteredSubGroups[selectedSubIdx];
  if (!group) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  const lines = group.items
    .map(
      (s) => `<div class="fragment" data-link-page="${escapeHtml(subtitlePageKey(s))}">
        <div class="fragment-title">Part ${escapeHtml(subtitlePartLabel(s.Name)) || "?"} <span class="muted">${formatDuration(s.Duration)}</span></div>
        <p>${escapeHtml(s.Subtitle)}</p>
      </div>`
    )
    .join("");
  const count = group.items.length;
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(group.key)} ${selectedSubIdx + 1}/${filteredSubGroups.length}</div>
    <div class="detail-head-2">${count} ${count === 1 ? "line" : "lines"} · ${formatDuration(group.totalDuration)}</div>
    ${lines}
  `;
}

/**
 * Dispatches detail screen rendering according to the currently active Browse mode scope.
 */
function renderDetail() {
  if (browseScope === "logs") renderLogDetail();
  else if (browseScope === "subtitles") renderSubDetail();
}

// The curated site/sampledata/data.json is a hand-maintained snapshot and can drift
// out of sync with the game's real unlock text (or lack an entry's unlock text
// entirely). voyage_sampledata_text_dump.json is dumped straight from the game at
// each version, so its sentDescription is the source of truth for `unlock` -- it's
// merged in here rather than trusted from the curated file.
/**
 * Enriches curated sample data objects with authoritative unlock descriptions from game text dumps.
 *
 * @param {Array<object>} samples - Hand-curated sample data entries.
 * @param {Array<object>} textDump - Authoritative raw sample text records dumped from game engine.
 * @returns {Array<object>} Merged sample data records.
 */
function mergeSampleDataText(samples, textDump) {
  const byId = new Map();
  for (const t of textDump) byId.set(t.id, t);
  return samples.map((s) => {
    const t = byId.get(`DA_SampleData_${s.id}`);
    return t && t.sentDescription ? { ...s, unlock: t.sentDescription } : s;
  });
}

/**
 * Loads all data dumps for a specific commit SHA in Browse mode and re-renders lists and detail panes.
 *
 * @param {string} sha - Git commit SHA to load.
 * @returns {Promise<void>} Resolves when version data is loaded and rendered.
 */
async function loadBrowseVersion(sha) {
  setStatus("Loading version…");
  currentBrowseSha = sha;
  try {
    const [logsJson, subsJson, sampleJson, sampleTextJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, sha),
      fetchFileAtSha(PATHS.subtitles, sha),
      fetchFileAtSha(PATHS.sampleData, sha),
      fetchFileAtSha(PATHS.sampleText, sha),
    ]);
    const { logs } = normalizeLogs(logsJson);
    currentBrowseLogs = logs;
    currentBrowseSubs = normalizeArrayJson(subsJson);
    sampleData = mergeSampleDataText(normalizeArrayJson(sampleJson), normalizeArrayJson(sampleTextJson));
    selectedLogIdx = -1;
    selectedSubIdx = -1;
    selectedSampleIdx = -1;
    selectedLogKey = null;
    selectedSubKey = null;
    selectedSampleKey = null;

    renderBrowseLogs(currentFilterValue());
    renderBrowseSubs(currentFilterValue());
    renderSampleList(currentFilterValue());
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
}

// ---------- sample data ----------

/**
 * Formats a sample data item identifier into a standardized code (e.g. 'SD-013' or 'CAVE-502').
 *
 * @param {object} it - Sample data item record.
 * @returns {string} Formatted sample code string.
 */
function sampleCode(it) {
  return it.collection === "cave"
    ? `CAVE-${String(it.id.replace("CavePainting_", "")).padStart(3, "0")}`
    : `SD-${String(it.id).padStart(3, "0")}`;
}

/**
 * Returns a human-readable discovery location label for a sample data collectible.
 *
 * @param {object} it - Sample data item record.
 * @returns {string} Location name or 'Orbit archive' for cave paintings.
 */
function sampleSiteLabel(it) {
  return it.collection === "cave" ? "Orbit archive" : it.site || "—";
}

// Thumbnails live at the repo root (sampledata_images/SampleData_<id>.png), same as
// the *_dump.json files -- raw.githubusercontent.com works directly as an <img> src,
// no fetch/decode needed, and it's naturally version-aware like the JSON dumps (not
// every id has art, e.g. "Bed on Wheels" -- a 404 there is expected, not a bug).
/**
 * Constructs the raw GitHub URL for a sample collectible's thumbnail image at the current commit SHA.
 *
 * @param {object} it - Sample data item record.
 * @returns {string|null} Full image URL string or null if no SHA is selected.
 */
function sampleImageUrl(it) {
  if (!currentBrowseSha) return null;
  return `https://raw.githubusercontent.com/${REPO}/${currentBrowseSha}/${PATHS.sampleImagesDir}/SampleData_${it.id}.png`;
}

/**
 * Filters and renders sample collectible cards in the Browse mode master list.
 *
 * @param {string} filterText - Search query string.
 */
function renderSampleList(filterText) {
  const term = (filterText || "").toLowerCase();
  filteredSamples = sampleData.filter((it) => {
    const matchesScope = sampleScope === "all" || it.collection === sampleScope;
    const hay = `${it.title} ${it.short} ${it.site || ""}`.toLowerCase();
    const matchesTerm = !term || hay.includes(term);
    return matchesScope && matchesTerm;
  });
  if (selectedSampleKey) {
    const matchIdx = filteredSamples.findIndex((it) => it.id === selectedSampleKey);
    if (matchIdx !== -1) selectedSampleIdx = matchIdx;
  }
  if (selectedSampleIdx >= filteredSamples.length) selectedSampleIdx = filteredSamples.length ? 0 : -1;
  if (selectedSampleIdx === -1 && filteredSamples.length) selectedSampleIdx = 0;
  selectedSampleKey = filteredSamples[selectedSampleIdx]?.id || null;

  const container = document.getElementById("sampledata-list");
  container.innerHTML = filteredSamples.length
    ? filteredSamples
        .map((it, i) => entryRowHtml(i, it.title, sampleCode(it), i === selectedSampleIdx))
        .join("")
    : `<p class="empty-note">No sample data matches your filter.</p>`;

  if (browseScope === "sampledata") {
    document.getElementById("list-count").textContent = `${filteredSamples.length}/${sampleData.length}`;
    renderSampleDetail();
    syncBrowseSelectionHash();
  }
}

/**
 * Renders collectible artwork, field reading notes, and encrypted/decrypted memory lore in the detail screen.
 */
function renderSampleDetail() {
  const pane = document.getElementById("sampledata-detail-pane");
  const it = filteredSamples[selectedSampleIdx];
  if (!it) {
    pane.innerHTML = `<p class="empty-note">Select a record from the list.</p>`;
    return;
  }

  // Not every id has a recovered texture (e.g. "Bed on Wheels") -- rather than
  // tracking that in data.json, just attempt the image and fall back on error.
  const imgUrl = sampleImageUrl(it);
  const media = `
    <div class="framebuffer" id="sample-framebuffer">
      <img id="sample-image" src="${imgUrl}" alt="${escapeHtml(it.title)}" loading="lazy">
      <div class="framebuffer-cap">FRAMEBUFFER // ${sampleCode(it)}.CAP</div>
    </div>
    <div class="fb-missing hidden" id="sample-image-missing">[ NO CAPTURE ON RECORD ]<br>scan exists in log only — image was never recovered</div>
  `;

  const isUnlocked = unlockedSamples.has(it.id);
  let lockHtml;
  if (!it.unlock) {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; memory status: <span class="muted">N/A</span></div>
      <p class="unlock-empty">No deeper memory was reconstructed from this scan.</p>
    </div>`;
  } else if (isUnlocked) {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; decrypting payload...... <span class="ok-tag">[OK]</span></div>
      <div class="section-label">Unlocked memory</div>
      <p class="unlock-text">${escapeHtml(it.unlock)}</p>
    </div>`;
  } else {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; memory status: <span class="locked-tag">LOCKED</span></div>
      <button class="device-btn unlock-btn" type="button" id="inline-unlock">Unlock memory</button>
    </div>`;
  }

  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(it.title)} ${selectedSampleIdx + 1}/${filteredSamples.length}</div>
    <div class="detail-head-2">${sampleCode(it)} · ${escapeHtml(sampleSiteLabel(it))}</div>
    ${media}
    <div class="section-label">Field reading</div>
    <p data-link-page="field-reading">${escapeHtml(it.short)}</p>
    ${lockHtml}
  `;

  const btn = document.getElementById("inline-unlock");
  if (btn) btn.addEventListener("click", () => unlockSample(it.id));

  const img = document.getElementById("sample-image");
  if (img) {
    img.addEventListener(
      "error",
      () => {
        document.getElementById("sample-framebuffer")?.classList.add("hidden");
        document.getElementById("sample-image-missing")?.classList.remove("hidden");
      },
      { once: true }
    );
  }
}

/**
 * Decrypts and unlocks hidden lore memory text for a specific sample data item.
 *
 * @param {string} id - Sample data item ID.
 */
function unlockSample(id) {
  const it = sampleData.find((s) => s.id === id);
  if (!it || !it.unlock) return;
  unlockedSamples.add(id);
  renderSampleDetail();
  syncBrowseSelectionHash();
}

// ---------- diffing ----------

/**
 * Computes a word-by-word visual diff using jsdiff, rendering `<ins>` and `<del>` tags for changes.
 *
 * @param {string} oldText - Baseline text string.
 * @param {string} newText - Updated text string.
 * @returns {string} HTML string containing formatted diff markup.
 */
function renderWordDiff(oldText, newText) {
  oldText = oldText || "";
  newText = newText || "";
  if (oldText === newText) return escapeHtml(newText);
  if (typeof Diff === "undefined") {
    return `${escapeHtml(oldText)} → ${escapeHtml(newText)}`;
  }
  return Diff.diffWords(oldText, newText)
    .map((part) => {
      const text = escapeHtml(part.value);
      if (part.added) return `<ins class="diff-ins">${text}</ins>`;
      if (part.removed) return `<del class="diff-del">${text}</del>`;
      return text;
    })
    .join("");
}

/**
 * Compares two lists of objects by a unique key function, returning added, removed, and changed sets.
 *
 * @param {Array<object>} fromList - Baseline items list.
 * @param {Array<object>} toList - Target items list.
 * @param {function(object): string} keyFn - Function returning unique string key for an item.
 * @returns {{ added: Array<object>, removed: Array<object>, changed: Array<{ key: string, from: object, to: object }> }}
 */
function diffByKey(fromList, toList, keyFn) {
  const fromMap = new Map(fromList.map((x) => [keyFn(x), x]));
  const toMap = new Map(toList.map((x) => [keyFn(x), x]));
  const added = [...toMap.keys()].filter((k) => !fromMap.has(k)).map((k) => toMap.get(k));
  const removed = [...fromMap.keys()].filter((k) => !toMap.has(k)).map((k) => fromMap.get(k));
  const changed = [];
  for (const k of toMap.keys()) {
    if (!fromMap.has(k)) continue;
    const a = fromMap.get(k);
    const b = toMap.get(k);
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push({ key: k, from: a, to: b });
  }
  return { added, removed, changed };
}

/**
 * Computes and renders HTML diff markup for fragments belonging to a voyage log.
 *
 * @param {object} fromLog - Baseline log object.
 * @param {object} toLog - Target log object.
 * @returns {string} Rendered HTML diff string for fragments.
 */
function renderFragmentDiff(fromLog, toLog) {
  const { added, removed, changed } = diffByKey(fromLog.fragments || [], toLog.fragments || [], (f) => f.id);
  if (!added.length && !removed.length && !changed.length) return "";
  const parts = [];
  for (const f of added) parts.push(`<div class="fragment"><span class="diff-tag added">New fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div><p>${escapeHtml(f.description)}</p></div>`);
  for (const f of removed) parts.push(`<div class="fragment"><span class="diff-tag removed">Removed fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div></div>`);
  for (const { from, to } of changed) {
    parts.push(`<div class="fragment"><span class="diff-tag changed">Changed fragment</span>
      <div class="fragment-title">${renderWordDiff(from.title, to.title)}</div>
      <p>${renderWordDiff(from.description, to.description)}</p>
    </div>`);
  }
  return parts.join("");
}

/**
 * Renders an individual difference card for an added, removed, or modified voyage log.
 *
 * @param {'added'|'removed'|'changed'} kind - Type of diff change.
 * @param {object} log - Log record or change pair.
 * @returns {string} Rendered diff card HTML.
 */
function renderLogDiffCard(kind, log) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(log.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(log.title)}</div>
      <p>${escapeHtml(log.description)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(log.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(log.title)}</div></div>`;
  }
  // changed
  const titleChanged = log.from.title !== log.to.title;
  const descChanged = log.from.description !== log.to.description;
  const footerChanged = log.from.footer !== log.to.footer;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(log.to.id)}</span>
    <div class="fragment-title" style="margin-top:.4rem">${titleChanged ? renderWordDiff(log.from.title, log.to.title) : escapeHtml(log.to.title)}</div>
    ${descChanged ? `<p>${renderWordDiff(log.from.description, log.to.description)}</p>` : ""}
    ${footerChanged ? `<p class="footer-text">${renderWordDiff(log.from.footer, log.to.footer)}</p>` : ""}
    ${renderFragmentDiff(log.from, log.to)}
  </div>`;
}

/**
 * Computes and renders the full structural and textual diff between two versions of voyage logs.
 *
 * @param {Array<object>} fromLogs - Baseline voyage logs array.
 * @param {Array<object>} toLogs - Target voyage logs array.
 */
function renderLogsDiff(fromLogs, toLogs) {
  const { added, removed, changed } = diffByKey(fromLogs, toLogs, (l) => l.id);
  const container = document.getElementById("compare-logs");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in voyage logs between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((l) => renderLogDiffCard("added", l)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderLogDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((l) => renderLogDiffCard("removed", l)).join("");
  }
  container.innerHTML = html;
}

/**
 * Renders an individual difference card for an added, removed, or modified quest subtitle line.
 *
 * @param {'added'|'removed'|'changed'} kind - Type of diff change.
 * @param {object} item - Subtitle line record or change pair.
 * @returns {string} Rendered diff card HTML.
 */
function renderSubDiffCard(kind, item) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(item.Name)}</span> ${formatDuration(item.Duration)}
      <p>${escapeHtml(item.Subtitle)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(item.Name)}</span>
      <p>${escapeHtml(item.Subtitle)}</p></div>`;
  }
  const durationChanged = item.from.Duration !== item.to.Duration;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(item.to.Name)}</span>
    ${durationChanged ? `<span class="muted"> ${formatDuration(item.from.Duration)} → ${formatDuration(item.to.Duration)}</span>` : ""}
    <p>${renderWordDiff(item.from.Subtitle, item.to.Subtitle)}</p></div>`;
}

/**
 * Computes and renders the full structural and textual diff between two versions of quest subtitles.
 *
 * @param {Array<object>} fromSubs - Baseline quest subtitles array.
 * @param {Array<object>} toSubs - Target quest subtitles array.
 */
function renderSubsDiff(fromSubs, toSubs) {
  const { added, removed, changed } = diffByKey(fromSubs, toSubs, (s) => s.Name);
  const container = document.getElementById("compare-subtitles");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in quest subtitles between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((s) => renderSubDiffCard("added", s)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderSubDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((s) => renderSubDiffCard("removed", s)).join("");
  }
  container.innerHTML = html;
}

/**
 * Renders an individual difference card for an added, removed, or modified sample data item.
 *
 * @param {'added'|'removed'|'changed'} kind - Type of diff change.
 * @param {object} item - Sample text record or change pair.
 * @returns {string} Rendered diff card HTML.
 */
function renderSampleTextDiffCard(kind, item) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(item.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(item.title)}</div>
      <p>${escapeHtml(item.sentDescription)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(item.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(item.title)}</div></div>`;
  }
  const titleChanged = item.from.title !== item.to.title;
  const uncollectedChanged = item.from.uncollectedDescription !== item.to.uncollectedDescription;
  const sentChanged = item.from.sentDescription !== item.to.sentDescription;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(item.to.id)}</span>
    <div class="fragment-title" style="margin-top:.4rem">${titleChanged ? renderWordDiff(item.from.title, item.to.title) : escapeHtml(item.to.title)}</div>
    ${uncollectedChanged ? `<p>${renderWordDiff(item.from.uncollectedDescription, item.to.uncollectedDescription)}</p>` : ""}
    ${sentChanged ? `<p>${renderWordDiff(item.from.sentDescription, item.to.sentDescription)}</p>` : ""}
  </div>`;
}

// Sample data ids come from FindAllOf()'s arbitrary traversal order (unlike logs/
// subtitles, which are already author-ordered), e.g. "DA_SampleData_131" right
// before "DA_SampleData_104" -- so sort numerically for a stable, readable diff.
/**
 * Computes numerical sorting tuple for sample data IDs to ensure stable diff ordering.
 *
 * @param {string} id - Raw sample data identifier.
 * @returns {[number, number]} Sorting tuple [categoryWeight, numericId].
 */
function sampleIdSortKey(id) {
  const m = /^DA_SampleData_(?:(CavePainting)_)?(\d+)$/.exec(id || "");
  return m ? [m[1] ? 1 : 0, parseInt(m[2], 10)] : [2, 0];
}

/**
 * Comparator function to sort sample data IDs numerically.
 *
 * @param {string} a - First sample data ID.
 * @param {string} b - Second sample data ID.
 * @returns {number} Comparison result (-1, 0, 1).
 */
function compareSampleIds(a, b) {
  const ka = sampleIdSortKey(a);
  const kb = sampleIdSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

/**
 * Computes and renders the full structural and textual diff between two versions of sample data text.
 *
 * @param {Array<object>} fromItems - Baseline sample text items.
 * @param {Array<object>} toItems - Target sample text items.
 */
function renderSampleTextDiff(fromItems, toItems) {
  const { added, removed, changed } = diffByKey(fromItems, toItems, (s) => s.id);
  added.sort((a, b) => compareSampleIds(a.id, b.id));
  removed.sort((a, b) => compareSampleIds(a.id, b.id));
  changed.sort((a, b) => compareSampleIds(a.to.id, b.to.id));
  const container = document.getElementById("compare-sampledata");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in sample data text between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((s) => renderSampleTextDiffCard("added", s)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderSampleTextDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((s) => renderSampleTextDiffCard("removed", s)).join("");
  }
  container.innerHTML = html;
}

/**
 * Fetches data artifacts for 'From' and 'To' commit SHAs and renders diff views across all scopes.
 *
 * @returns {Promise<void>} Resolves when diff comparison is completed and rendered.
 */
async function loadCompare() {
  const fromSha = document.getElementById("compare-from").value;
  const toSha = document.getElementById("compare-to").value;
  if (!fromSha || !toSha) return;
  setStatus("Comparing versions…");
  try {
    const [fromLogsJson, toLogsJson, fromSubsJson, toSubsJson, fromSampleJson, toSampleJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, fromSha),
      fetchFileAtSha(PATHS.logs, toSha),
      fetchFileAtSha(PATHS.subtitles, fromSha),
      fetchFileAtSha(PATHS.subtitles, toSha),
      fetchFileAtSha(PATHS.sampleText, fromSha),
      fetchFileAtSha(PATHS.sampleText, toSha),
    ]);
    renderLogsDiff(normalizeLogs(fromLogsJson).logs, normalizeLogs(toLogsJson).logs);
    renderSubsDiff(normalizeArrayJson(fromSubsJson), normalizeArrayJson(toSubsJson));
    renderSampleTextDiff(normalizeArrayJson(fromSampleJson), normalizeArrayJson(toSampleJson));
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
}

// ---------- toolbar wiring ----------

/**
 * Binds event listeners to Browse and Compare top-level navigation tabs.
 */
function wireModeTabs() {
  const tabs = document.querySelectorAll("#mode-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });
}

/**
 * Switches the active UI application mode between 'browse' and 'compare'.
 *
 * @param {'browse'|'compare'} mode - Target application mode.
 */
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll("#mode-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
  document.getElementById("panel-browse").classList.toggle("active", currentMode === "browse");
  document.getElementById("panel-compare").classList.toggle("active", currentMode === "compare");
  document.getElementById("browse-controls").classList.toggle("hidden", currentMode !== "browse");
  document.getElementById("compare-controls").classList.toggle("hidden", currentMode !== "compare");
  const filterInput = document.getElementById("filter-input");
  const terminalBar = document.getElementById("terminal-bar");
  if (currentMode === "compare") {
    terminalBar.classList.add("disabled");
    filterInput.placeholder = "filtering not available in compare mode";
  } else {
    terminalBar.classList.remove("disabled");
    filterInput.placeholder = browseScope === "sampledata" ? "type to filter sample data…" : "type to filter…";
  }
  updateCopyLinkButton();
  if (currentMode === "compare") loadCompare();
}

const SCOPE_TITLES = { logs: "DATA LOGS", subtitles: "QUEST SUBTITLES", sampledata: "SAMPLE DATA" };
const COMPARE_SCOPE_TITLES = { logs: "VOYAGE LOGS", subtitles: "QUEST SUBTITLES", sampledata: "SAMPLE DATA" };

/**
 * Binds event listeners to Browse mode content category tabs (Logs, Subtitles, Sample Data).
 */
function wireBrowseContentTabs() {
  const buttons = document.querySelectorAll("#browse-content-tabs .content-tab");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyBrowseScope(btn.dataset.content, { resetFilter: true });
    });
  });
}

/**
 * Binds event listeners to Compare mode content category tabs (Logs, Subtitles, Sample Data).
 */
function wireCompareContentTabs() {
  const buttons = document.querySelectorAll("#compare-content-tabs .content-tab");
  const label = document.getElementById("compare-scope-label");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      compareScope = btn.dataset.content;
      document.getElementById("compare-logs").classList.toggle("active", compareScope === "logs");
      document.getElementById("compare-subtitles").classList.toggle("active", compareScope === "subtitles");
      document.getElementById("compare-sampledata").classList.toggle("active", compareScope === "sampledata");
      label.textContent = COMPARE_SCOPE_TITLES[compareScope];
    });
  });
}

/**
 * Binds event listeners to Sample Data subcategory filter tabs (All, Hologram, Painting).
 */
function wireSampleContentTabs() {
  const buttons = document.querySelectorAll("#sampledata-content-tabs .content-tab");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applySampleScope(btn.dataset.content, { resetFilter: true });
    });
  });
}

/**
 * Attaches delegated click listeners to master list rows for item selection.
 */
function wireEntryListClicks() {
  document.getElementById("logs-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedLogIdx = Number(row.dataset.idx);
    selectedLogKey = filteredLogs[selectedLogIdx]?.id || null;
    renderBrowseLogs(currentFilterValue());
  });
  document.getElementById("subs-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedSubIdx = Number(row.dataset.idx);
    selectedSubKey = filteredSubGroups[selectedSubIdx]?.key || null;
    renderBrowseSubs(currentFilterValue());
  });
  document.getElementById("sampledata-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedSampleIdx = Number(row.dataset.idx);
    selectedSampleKey = filteredSamples[selectedSampleIdx]?.id || null;
    renderSampleList(currentFilterValue());
  });
}

/**
 * Attaches real-time search filtering listeners to the terminal search input.
 */
function wireFilterInput() {
  document.getElementById("filter-input").addEventListener("input", (e) => {
    if (currentMode !== "browse") return;
    if (browseScope === "logs") renderBrowseLogs(e.target.value);
    else if (browseScope === "subtitles") renderBrowseSubs(e.target.value);
    else renderSampleList(e.target.value);
  });
}

/**
 * Attaches click and selection listeners to deep-link sharing buttons.
 */
function wireShareLinkButton() {
  document.getElementById("copy-link-btn").addEventListener("click", async () => {
    if (currentMode !== "browse" || !currentSelectedEntryKey()) return;
    try {
      await copyText(currentEntryShareUrl());
      setStatus("Entry link copied.");
      window.setTimeout(() => setStatus(""), 1500);
    } catch (err) {
      console.error(err);
      setStatus("Could not copy link.", true);
    }
  });

  const selectionBtn = document.getElementById("selection-link-btn");
  selectionBtn.addEventListener("mousedown", (e) => e.preventDefault());
  selectionBtn.addEventListener("click", async () => {
    if (!activeSelectionContext) return;
    try {
      await copyText(currentSelectionShareUrl());
      setStatus("Selection link copied.");
      window.setTimeout(() => setStatus(""), 1500);
    } catch (err) {
      console.error(err);
      setStatus("Could not copy link.", true);
    }
  });

  document.addEventListener("selectionchange", () => {
    updateCopyLinkButton();
    updateSelectionLinkButton();
  });
  window.addEventListener("scroll", updateSelectionLinkButton, true);
  window.addEventListener("resize", updateSelectionLinkButton);
}

// ---------- device controls ----------

/**
 * Steps the selected master list entry forward or backward by the specified index delta.
 *
 * @param {number} delta - Number of steps (+1 for next, -1 for previous).
 */
function moveSelection(delta) {
  if (currentMode !== "browse") return;
  if (browseScope === "logs") {
    if (!filteredLogs.length) return;
    selectedLogIdx = (selectedLogIdx + delta + filteredLogs.length) % filteredLogs.length;
    selectedLogKey = filteredLogs[selectedLogIdx]?.id || null;
    renderBrowseLogs(currentFilterValue());
    scrollSelectedEntryIntoView();
  } else if (browseScope === "subtitles") {
    if (!filteredSubGroups.length) return;
    selectedSubIdx = (selectedSubIdx + delta + filteredSubGroups.length) % filteredSubGroups.length;
    selectedSubKey = filteredSubGroups[selectedSubIdx]?.key || null;
    renderBrowseSubs(currentFilterValue());
    scrollSelectedEntryIntoView();
  } else {
    if (!filteredSamples.length) return;
    selectedSampleIdx = (selectedSampleIdx + delta + filteredSamples.length) % filteredSamples.length;
    selectedSampleKey = filteredSamples[selectedSampleIdx]?.id || null;
    renderSampleList(currentFilterValue());
    scrollSelectedEntryIntoView();
  }
}

// Compare mode has no browsable entry list (just diff cards), so PREV/NEXT there
// still step through the "to" version instead.
/**
 * Steps the Compare mode 'To' version forward or backward by index in the commit dropdown.
 *
 * @param {number} delta - Index step direction (+1 for older, -1 for newer).
 */
function stepVersion(delta) {
  const select = document.getElementById("compare-to");
  const nextIndex = select.selectedIndex + delta;
  if (nextIndex < 0 || nextIndex >= select.options.length) return;
  select.selectedIndex = nextIndex;
  select.dispatchEvent(new Event("change"));
}

/**
 * Smoothly scrolls the active Browse mode detail screen viewport vertically.
 *
 * @param {number} delta - Vertical scroll offset in pixels.
 */
function scrollBrowseDetail(delta) {
  document.querySelector("#panel-browse .detail-screen .screen-scroll")?.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * Initializes physical hardware pushbuttons (EXE, EXIT, UP, DOWN, PREV, NEXT, display toggles).
 */
function wireDeviceControls() {
  // In Browse mode, UP/DOWN scroll the detail pane and PREV/NEXT step between
  // entries in the list -- Compare mode has no entry list, so there PREV/NEXT
  // fall back to stepping the "to" version instead.
  document.getElementById("btn-up").addEventListener("click", () => {
    if (currentMode === "browse") scrollBrowseDetail(-120);
  });
  document.getElementById("btn-down").addEventListener("click", () => {
    if (currentMode === "browse") scrollBrowseDetail(120);
  });
  document.getElementById("btn-prev").addEventListener("click", () => {
    if (currentMode === "browse") moveSelection(-1);
    else stepVersion(1); // older
  });
  document.getElementById("btn-next").addEventListener("click", () => {
    if (currentMode === "browse") moveSelection(1);
    else stepVersion(-1); // newer
  });
  document.getElementById("btn-exe").addEventListener("click", () => {
    if (currentMode === "compare") {
      loadCompare();
    } else if (browseScope === "sampledata") {
      const it = filteredSamples[selectedSampleIdx];
      if (it) unlockSample(it.id);
    } else {
      document.getElementById("filter-input").focus();
    }
  });
  document.getElementById("btn-exit").addEventListener("click", () => {
    const input = document.getElementById("filter-input");
    input.value = "";
    input.blur();
    clearCopiedSelection();
    hideSelectionLinkButton();
    if (currentMode !== "browse") return;
    if (browseScope === "logs") renderBrowseLogs("");
    else if (browseScope === "subtitles") renderBrowseSubs("");
    else renderSampleList("");
  });

  const led = document.getElementById("status-led");
  const dispBtn = document.getElementById("disp-toggle");
  const screensEls = () => document.querySelectorAll(".screens");
  /**
   * Applies CSS brightness, contrast, and saturation filter settings to CRT screen viewports.
   */

  function applyDisplayFilter() {
    screensEls().forEach((el) => {
      el.style.filter = displayOn ? `brightness(${brt}%) contrast(${con}%) saturate(${sat}%)` : "brightness(0%)";
    });
  }

  dispBtn.addEventListener("click", () => {
    displayOn = !displayOn;
    dispBtn.textContent = displayOn ? "DISP ON" : "DISP OFF";
    led.classList.toggle("off", !displayOn);
    applyDisplayFilter();
  });

  document.querySelectorAll(".control-grid [data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const clamp = (v) => Math.max(40, Math.min(160, v));
      if (action === "brt-up") brt = clamp(brt + 10);
      if (action === "brt-down") brt = clamp(brt - 10);
      if (action === "con-up") con = clamp(con + 10);
      if (action === "con-down") con = clamp(con - 10);
      if (action === "sat-up") sat = clamp(sat + 10);
      if (action === "sat-down") sat = clamp(sat - 10);
      applyDisplayFilter();
    });
  });
}

// ---------- bootstrap ----------

/**
 * Bootstraps the application on DOMContentLoaded: initializes UI listeners, loads commit history, and applies initial hash state.
 *
 * @returns {Promise<void>} Resolves when application initialization completes.
 */
async function init() {
  if (!REPO) {
    setStatus("Could not determine which repo to load from this URL -- pass ?repo=owner/name (e.g. for local testing).", true);
    return;
  }

  wireModeTabs();
  wireBrowseContentTabs();
  wireCompareContentTabs();
  wireSampleContentTabs();
  wireEntryListClicks();
  wireFilterInput();
  wireShareLinkButton();
  wireDeviceControls();

  setStatus("Loading commit history…");
  try {
    versions = await buildVersionList();
    if (!versions.length) throw new Error("No commit history found for these files.");
    populateVersionSelects();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
    return;
  }

  document.getElementById("browse-version").addEventListener("change", (e) => loadBrowseVersion(e.target.value));
  document.getElementById("compare-from").addEventListener("change", loadCompare);
  document.getElementById("compare-to").addEventListener("change", loadCompare);
  window.addEventListener("hashchange", () => {
    applyBrowseHashState().catch((err) => {
      console.error(err);
      setStatus(err.message, true);
    });
  });

  if (!(await applyBrowseHashState())) {
    await loadBrowseVersion(document.getElementById("browse-version").value);
  }
}

document.addEventListener("DOMContentLoaded", init);
