import { escapeHtml } from "../core/formatters.js";

export function renderWordDiff(oldText, newText) {
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

export function diffByKey(fromList, toList, keyFn) {
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
