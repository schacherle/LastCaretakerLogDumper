import { REPO, PATHS } from "../api/github.js";

export function sampleCode(it) {
  return it.collection === "cave"
    ? `CAVE-${String(it.id.replace("CavePainting_", "")).padStart(3, "0")}`
    : `SD-${String(it.id).padStart(3, "0")}`;
}

export function sampleSiteLabel(it) {
  return it.collection === "cave" ? "Orbit archive" : it.site || "—";
}

// Thumbnails live at the repo root (sampledata_images/SampleData_<id>.png), same as
// the *_dump.json files -- raw.githubusercontent.com works directly as an <img> src,
// no fetch/decode needed, and it's naturally version-aware like the JSON dumps (not
// every id has art, e.g. "Bed on Wheels" -- a 404 there is expected, not a bug).
export function sampleImageUrl(it, sha) {
  if (!sha) return null;
  return `https://raw.githubusercontent.com/${REPO}/${sha}/${PATHS.sampleImagesDir}/SampleData_${it.id}.png`;
}

// The curated site/sampledata/data.json is a hand-maintained snapshot and can drift
// out of sync with the game's real unlock text (or lack an entry's unlock text
// entirely). voyage_sampledata_text_dump.json is dumped straight from the game at
// each version, so its sentDescription is the source of truth for `unlock` -- it's
// merged in here rather than trusted from the curated file.
export function mergeSampleDataText(samples, textDump) {
  const byId = new Map();
  for (const t of textDump) byId.set(t.id, t);
  return samples.map((s) => {
    const t = byId.get(`DA_SampleData_${s.id}`);
    return t && t.sentDescription ? { ...s, unlock: t.sentDescription } : s;
  });
}

// Sample data ids come from FindAllOf()'s arbitrary traversal order (unlike logs/
// subtitles, which are already author-ordered), e.g. "DA_SampleData_131" right
// before "DA_SampleData_104" -- so sort numerically for a stable, readable diff.
export function sampleIdSortKey(id) {
  const m = /^DA_SampleData_(?:(CavePainting)_)?(\d+)$/.exec(id || "");
  return m ? [m[1] ? 1 : 0, parseInt(m[2], 10)] : [2, 0];
}

export function compareSampleIds(a, b) {
  const ka = sampleIdSortKey(a);
  const kb = sampleIdSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}
