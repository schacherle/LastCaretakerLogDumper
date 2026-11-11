// GitHub Pages project sites are always served as https://<owner>.github.io/<repo>/,
// so the repo this site should read from can be read straight off the URL instead of
// hardcoded -- the same app.js works unmodified on any fork's Pages deployment. Falls
// back to this repo for local testing (file://, localhost) where that pattern doesn't apply.
export function detectRepo() {
  const override = new URLSearchParams(location.search).get("repo");
  if (override) return override;
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const repoName = m && location.pathname.split("/").filter(Boolean)[0];
  return m && repoName ? `${m[1]}/${repoName}` : null;
}

export const REPO = detectRepo();

export const PATHS = {
  logs: "voyage_logs_dump.json",
  subtitles: "voyage_quest_subtitles_dump.json",
  sampleText: "voyage_sampledata_text_dump.json",
  sampleData: "site/sampledata/data.json",
  sampleImagesDir: "sampledata_images",
};

const fileCache = new Map(); // `${sha}:${path}` -> parsed json | null (missing)

export function decodeArrayBuffer(buf) {
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

export async function fetchFileAtSha(path, sha) {
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

export async function fetchCommitsForPath(path) {
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

export async function buildVersionList() {
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
