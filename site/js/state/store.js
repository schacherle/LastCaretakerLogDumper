export const SCOPE_TITLES = {
  logs: "DATA LOGS",
  subtitles: "QUEST SUBTITLES",
  sampledata: "SAMPLE DATA",
};

export const COMPARE_SCOPE_TITLES = {
  logs: "VOYAGE LOGS",
  subtitles: "QUEST SUBTITLES",
  sampledata: "SAMPLE DATA",
};

export const state = {
  versions: [], // [{ sha, message, date }], newest first
  currentBrowseSha: null,
  currentBrowseLogs: [],
  currentBrowseSubs: [],
  filteredLogs: [],
  filteredSubGroups: [],

  currentMode: "browse", // "browse" | "compare"
  browseScope: "logs", // "logs" | "subtitles" | "sampledata"
  compareScope: "logs", // "logs" | "subtitles" | "sampledata"
  selectedLogIdx: -1,
  selectedSubIdx: -1,
  selectedLogKey: null,
  selectedSubKey: null,

  sampleData: [],
  filteredSamples: [],
  sampleScope: "all", // "all" | "field" | "cave"
  selectedSampleIdx: -1,
  selectedSampleKey: null,
  unlockedSamples: new Set(),

  activeSelectionContext: null,
  isApplyingHashState: false,

  displayOn: true,
  brt: 100,
  con: 100,
  sat: 100,
};

export function currentSelectedEntryKey() {
  if (state.browseScope === "logs") return state.selectedLogKey;
  if (state.browseScope === "subtitles") return state.selectedSubKey;
  return state.selectedSampleKey;
}

export function currentSelectedEntry() {
  if (state.browseScope === "logs") return state.filteredLogs[state.selectedLogIdx] || null;
  if (state.browseScope === "subtitles") return state.filteredSubGroups[state.selectedSubIdx] || null;
  return state.filteredSamples[state.selectedSampleIdx] || null;
}

export function resolveVersionSha(version) {
  if (!version) return "";
  const exact = state.versions.find((v) => v.sha === version);
  if (exact) return exact.sha;
  const matches = state.versions.filter((v) => v.sha.startsWith(version));
  return matches.length === 1 ? matches[0].sha : "";
}
