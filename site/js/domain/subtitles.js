// Subtitle names encode "<storyline>-<part>", e.g. "CU3_3-1" .. "CU3_3-6" are six
// lines of the same storyline (CU3 = Concurrent Update 3, "3" = story index).
// Part suffixes aren't always plain integers (e.g. "-1a", "-2_Anna_B"), so only the
// leading digits are used for ordering within a group.
const SUBTITLE_PART_RE = /^(.*)-(\d.*)$/;

export function subtitleGroupKey(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[1] : (name || "");
}

export function subtitlePartLabel(name) {
  const m = SUBTITLE_PART_RE.exec(name || "");
  return m ? m[2] : "";
}

export function subtitlePartNumber(name) {
  const n = parseInt(subtitlePartLabel(name), 10);
  return Number.isNaN(n) ? 0 : n;
}

export function subtitlePageKey(item) {
  return `part:${item?.Name || ""}`;
}

export function groupSubtitles(subs) {
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
