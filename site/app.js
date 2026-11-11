import { escapeHtml, formatDate, firstLine } from "./js/core/formatters.js";
import { copyText } from "./js/core/clipboard.js";
import { REPO, PATHS, fetchFileAtSha, buildVersionList } from "./js/api/github.js";
import { normalizeLogs, normalizeArrayJson } from "./js/domain/logs.js";
import { mergeSampleDataText } from "./js/domain/sampledata.js";
import {
  state,
  currentSelectedEntryKey,
  resolveVersionSha,
  COMPARE_SCOPE_TITLES,
} from "./js/state/store.js";
import {
  parseBrowseHash,
  focusBrowseHashTarget,
} from "./js/state/router.js";
import {
  currentFilterValue,
  applyBrowseScope,
  applySampleScope,
  renderBrowseLogs,
  renderBrowseSubs,
  renderSampleList,
  updateCopyLinkButton,
  updateSelectionLinkButton,
  selectBrowseEntryByKey,
  scrollSelectedEntryIntoView,
  currentEntryShareUrl,
  currentSelectionShareUrl,
} from "./js/ui/browse.js";
import { loadCompare } from "./js/ui/compare.js";
import { wireDeviceControls } from "./js/ui/device.js";

// ---------- status handling ----------

export function setStatus(text, isError) {
  const el = document.getElementById("status");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", !!isError);
}

// ---------- version loading & selection ----------

export function populateVersionSelects() {
  const optionsHtml = state.versions
    .map(
      (v) =>
        `<option value="${v.sha}">${escapeHtml(formatDate(v.date))} · ${escapeHtml(
          firstLine(v.message)
        )} (${v.sha.slice(0, 7)})</option>`
    )
    .join("");
  for (const id of ["browse-version", "compare-from", "compare-to"]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = optionsHtml;
  }
  document.getElementById("browse-version").value = state.versions[0].sha;
  document.getElementById("compare-to").value = state.versions[0].sha;
  document.getElementById("compare-from").value = (state.versions[1] || state.versions[0]).sha;
}

export async function loadBrowseVersion(sha) {
  setStatus("Loading version…");
  state.currentBrowseSha = sha;
  try {
    const [logsJson, subsJson, sampleJson, sampleTextJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, sha),
      fetchFileAtSha(PATHS.subtitles, sha),
      fetchFileAtSha(PATHS.sampleData, sha),
      fetchFileAtSha(PATHS.sampleText, sha),
    ]);
    const { logs } = normalizeLogs(logsJson);
    state.currentBrowseLogs = logs;
    state.currentBrowseSubs = normalizeArrayJson(subsJson);
    state.sampleData = mergeSampleDataText(
      normalizeArrayJson(sampleJson),
      normalizeArrayJson(sampleTextJson)
    );
    state.selectedLogIdx = -1;
    state.selectedSubIdx = -1;
    state.selectedSampleIdx = -1;
    state.selectedLogKey = null;
    state.selectedSubKey = null;
    state.selectedSampleKey = null;

    renderBrowseLogs(currentFilterValue());
    renderBrowseSubs(currentFilterValue());
    renderSampleList(currentFilterValue());
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
}

// ---------- mode switching & hash routing ----------

export function setMode(mode) {
  state.currentMode = mode;
  document.querySelectorAll("#mode-tabs .tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.mode === mode)
  );
  document.getElementById("panel-browse")?.classList.toggle("active", state.currentMode === "browse");
  document.getElementById("panel-compare")?.classList.toggle("active", state.currentMode === "compare");
  document.getElementById("browse-controls")?.classList.toggle("hidden", state.currentMode !== "browse");
  document.getElementById("compare-controls")?.classList.toggle("hidden", state.currentMode !== "compare");
  const filterInput = document.getElementById("filter-input");
  const terminalBar = document.getElementById("terminal-bar");
  if (state.currentMode === "compare") {
    terminalBar?.classList.add("disabled");
    if (filterInput) filterInput.placeholder = "filtering not available in compare mode";
  } else {
    terminalBar?.classList.remove("disabled");
    if (filterInput) {
      filterInput.placeholder =
        state.browseScope === "sampledata" ? "type to filter sample data…" : "type to filter…";
    }
  }
  updateCopyLinkButton();
  if (state.currentMode === "compare") loadCompare(setStatus);
}

export async function applyBrowseHashState() {
  const hashState = parseBrowseHash();
  if (!hashState) return false;

  state.isApplyingHashState = true;
  try {
    setMode("browse");
    applyBrowseScope(hashState.scope, { resetFilter: true });
    if (hashState.scope === "sampledata") {
      applySampleScope(hashState.sampleScope, { resetFilter: false });
    }

    const browseSelect = document.getElementById("browse-version");
    const version = resolveVersionSha(hashState.version) || browseSelect?.value;
    if (browseSelect && browseSelect.value !== version) browseSelect.value = version;
    if (state.currentBrowseSha !== version) await loadBrowseVersion(version);

    if (hashState.scope === "sampledata" && hashState.unlocked && hashState.entry) {
      state.unlockedSamples.add(hashState.entry);
    }
    if (hashState.entry) selectBrowseEntryByKey(hashState.scope, hashState.entry);
    scrollSelectedEntryIntoView();
    if (hashState.page || hashState.text) {
      requestAnimationFrame(() => focusBrowseHashTarget(hashState));
    }
    updateCopyLinkButton();
    return true;
  } finally {
    state.isApplyingHashState = false;
  }
}

// ---------- event wiring ----------

function wireModeTabs() {
  const tabs = document.querySelectorAll("#mode-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });
}

function wireBrowseContentTabs() {
  const buttons = document.querySelectorAll("#browse-content-tabs .content-tab");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyBrowseScope(btn.dataset.content, { resetFilter: true });
    });
  });
}

function wireCompareContentTabs() {
  const buttons = document.querySelectorAll("#compare-content-tabs .content-tab");
  const label = document.getElementById("compare-scope-label");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.compareScope = btn.dataset.content;
      document.getElementById("compare-logs")?.classList.toggle("active", state.compareScope === "logs");
      document.getElementById("compare-subtitles")?.classList.toggle("active", state.compareScope === "subtitles");
      document.getElementById("compare-sampledata")?.classList.toggle("active", state.compareScope === "sampledata");
      if (label) label.textContent = COMPARE_SCOPE_TITLES[state.compareScope];
    });
  });
}

function wireSampleContentTabs() {
  const buttons = document.querySelectorAll("#sampledata-content-tabs .content-tab");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applySampleScope(btn.dataset.content, { resetFilter: true });
    });
  });
}

function wireEntryListClicks() {
  document.getElementById("logs-list")?.addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    state.selectedLogIdx = Number(row.dataset.idx);
    state.selectedLogKey = state.filteredLogs[state.selectedLogIdx]?.id || null;
    renderBrowseLogs(currentFilterValue());
  });
  document.getElementById("subs-list")?.addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    state.selectedSubIdx = Number(row.dataset.idx);
    state.selectedSubKey = state.filteredSubGroups[state.selectedSubIdx]?.key || null;
    renderBrowseSubs(currentFilterValue());
  });
  document.getElementById("sampledata-list")?.addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    state.selectedSampleIdx = Number(row.dataset.idx);
    state.selectedSampleKey = state.filteredSamples[state.selectedSampleIdx]?.id || null;
    renderSampleList(currentFilterValue());
  });
}

function wireFilterInput() {
  document.getElementById("filter-input")?.addEventListener("input", (e) => {
    if (state.currentMode !== "browse") return;
    if (state.browseScope === "logs") renderBrowseLogs(e.target.value);
    else if (state.browseScope === "subtitles") renderBrowseSubs(e.target.value);
    else renderSampleList(e.target.value);
  });
}

function wireShareLinkButton() {
  document.getElementById("copy-link-btn")?.addEventListener("click", async () => {
    if (state.currentMode !== "browse" || !currentSelectedEntryKey()) return;
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
  selectionBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  selectionBtn?.addEventListener("click", async () => {
    if (!state.activeSelectionContext) return;
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

// ---------- bootstrap ----------

export async function init() {
  if (!REPO) {
    setStatus(
      "Could not determine which repo to load from this URL -- pass ?repo=owner/name (e.g. for local testing).",
      true
    );
    return;
  }

  wireModeTabs();
  wireBrowseContentTabs();
  wireCompareContentTabs();
  wireSampleContentTabs();
  wireEntryListClicks();
  wireFilterInput();
  wireShareLinkButton();
  wireDeviceControls(setStatus);

  setStatus("Loading commit history…");
  try {
    state.versions = await buildVersionList();
    if (!state.versions.length) throw new Error("No commit history found for these files.");
    populateVersionSelects();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
    return;
  }

  document.getElementById("browse-version")?.addEventListener("change", (e) =>
    loadBrowseVersion(e.target.value)
  );
  document.getElementById("compare-from")?.addEventListener("change", () =>
    loadCompare(setStatus)
  );
  document.getElementById("compare-to")?.addEventListener("change", () =>
    loadCompare(setStatus)
  );
  window.addEventListener("hashchange", () => {
    applyBrowseHashState().catch((err) => {
      console.error(err);
      setStatus(err.message, true);
    });
  });

  if (!(await applyBrowseHashState())) {
    const browseSelect = document.getElementById("browse-version");
    if (browseSelect) await loadBrowseVersion(browseSelect.value);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
