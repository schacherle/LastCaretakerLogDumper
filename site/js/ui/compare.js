import { escapeHtml, formatDuration } from "../core/formatters.js";
import { renderWordDiff, diffByKey } from "../domain/diff.js";
import { compareSampleIds } from "../domain/sampledata.js";
import { normalizeLogs, normalizeArrayJson } from "../domain/logs.js";
import { fetchFileAtSha, PATHS } from "../api/github.js";

function renderFragmentDiff(fromLog, toLog) {
  const { added, removed, changed } = diffByKey(fromLog.fragments || [], toLog.fragments || [], (f) => f.id);
  if (!added.length && !removed.length && !changed.length) return "";
  const parts = [];
  for (const f of added) {
    parts.push(`<div class="fragment"><span class="diff-tag added">New fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div><p>${escapeHtml(f.description)}</p></div>`);
  }
  for (const f of removed) {
    parts.push(`<div class="fragment"><span class="diff-tag removed">Removed fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div></div>`);
  }
  for (const { from, to } of changed) {
    parts.push(`<div class="fragment"><span class="diff-tag changed">Changed fragment</span>
      <div class="fragment-title">${renderWordDiff(from.title, to.title)}</div>
      <p>${renderWordDiff(from.description, to.description)}</p>
    </div>`);
  }
  return parts.join("");
}

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

export function renderLogsDiff(fromLogs, toLogs) {
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

export function renderSubsDiff(fromSubs, toSubs) {
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

export function renderSampleTextDiff(fromItems, toItems) {
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

export async function loadCompare(setStatus) {
  const fromSha = document.getElementById("compare-from")?.value;
  const toSha = document.getElementById("compare-to")?.value;
  if (!fromSha || !toSha) return;
  if (setStatus) setStatus("Comparing versions…");
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
    if (setStatus) setStatus("");
  } catch (err) {
    console.error(err);
    if (setStatus) setStatus(err.message, true);
  }
}
