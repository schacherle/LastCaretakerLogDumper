// Validate repository slug pattern (owner/repo) to prevent path traversal,
// scheme injection, or domain spoofing into GitHub API and raw content requests.
export const REPO_SLUG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;

// Hex SHA or SHA prefix validator (1 to 40 hexadecimal characters).
export const SHA_HEX_RE = /^[0-9a-fA-F]{1,40}$/;

export const DEFAULT_REPO = "schacherle/LastCaretakerLogDumper";

export const PATHS = {
  logs: "voyage_logs_dump.json",
  subtitles: "voyage_quest_subtitles_dump.json",
  sampleText: "voyage_sampledata_text_dump.json",
  sampleData: "site/sampledata/data.json",
  timelineData: "site/timeline/data.json",
  sampleImagesDir: "sampledata_images",
};

const fileCache = new Map(); // `${sha}:${path}` -> parsed json | null (missing)

/**
 * Detects the target GitHub repository from `?repo=` override or `*.github.io/<repo>` URL.
 * Falls back to the default repository for local development (`localhost`, `file://`).
 * @param {Location|object} [loc] - Location-like object with search, hostname, pathname.
 * @returns {string} Repository slug in `owner/repo` format.
 */
export function detectRepo(loc = typeof location !== "undefined" ? location : null) {
  if (!loc) return DEFAULT_REPO;
  const override = new URLSearchParams(loc.search || "").get("repo");
  if (override && REPO_SLUG_RE.test(override)) return override;
  const m = /^([^.]+)\.github\.io$/.exec(loc.hostname || "");
  const repoName = m && (loc.pathname || "").split("/").filter(Boolean)[0];
  const detected = m && repoName ? `${m[1]}/${repoName}` : null;
  if (detected && REPO_SLUG_RE.test(detected)) return detected;
  return DEFAULT_REPO;
}

export const REPO = detectRepo();

/**
 * Validates a version SHA or `"local"` working-copy sentinel.
 * @param {string} sha - Candidate version identifier.
 * @returns {boolean} True if valid hex SHA/prefix or `"local"`.
 */
export function isValidVersionSha(sha) {
  return sha === "local" || SHA_HEX_RE.test(String(sha || ""));
}

/**
 * Decodes an ArrayBuffer respecting UTF-16 LE, UTF-16 BE, and UTF-8 BOMs.
 * @param {ArrayBuffer} buf - Raw byte buffer.
 * @returns {string} Decoded text string.
 */
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

/**
 * Fetches and parses a JSON file at a specific commit SHA or from the local working copy.
 * Results are cached per `${sha}:${path}`. Returns `null` on HTTP 404.
 * @param {string} path - Repository-relative path.
 * @param {string} sha - Commit SHA or `"local"`.
 * @returns {Promise<*|null>} Parsed JSON or `null` if missing.
 */
export async function fetchFileAtSha(path, sha) {
  if (!isValidVersionSha(sha)) {
    throw new Error(`Invalid version identifier: ${String(sha || "")}`);
  }
  const key = `${sha}:${path}`;
  if (fileCache.has(key)) return fileCache.get(key);

  let res;
  if (sha === "local") {
    res = await fetch(`/${path}`);
    if (!res.ok) res = await fetch(`../${path}`);
  } else {
    const url = `https://raw.githubusercontent.com/${encodeURI(REPO)}/${encodeURIComponent(sha)}/${path}`;
    res = await fetch(url);
  }

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
 * Lists all GitHub commits touching a given repository path, paginated across all pages.
 * @param {string} path - Repository-relative file path.
 * @returns {Promise<Array<{sha: string, message: string, date: string}>>}
 */
export async function fetchCommitsForPath(path) {
  const commits = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${encodeURI(REPO)}/commits?path=${encodeURIComponent(path)}&per_page=100&page=${page}`;
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
 * Builds the deduplicated, newest-first version list across all tracked archive files.
 * Includes `"Working Copy (Local Dumps)"` when running locally or if GitHub history is unavailable.
 * @returns {Promise<Array<{sha: string, message: string, date: string}>>}
 */
export async function buildVersionList() {
  let githubVersions = [];
  try {
    const [logCommits, subCommits, sampleTextCommits, sampleDataCommits, timelineCommits] = await Promise.all([
      fetchCommitsForPath(PATHS.logs),
      fetchCommitsForPath(PATHS.subtitles),
      fetchCommitsForPath(PATHS.sampleText),
      fetchCommitsForPath(PATHS.sampleData),
      fetchCommitsForPath(PATHS.timelineData),
    ]);
    const bySha = new Map();
    for (const c of [...logCommits, ...subCommits, ...sampleTextCommits, ...sampleDataCommits, ...timelineCommits]) {
      if (!bySha.has(c.sha)) bySha.set(c.sha, c);
    }
    githubVersions = [...bySha.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (err) {
    console.warn("Could not load GitHub commit history:", err);
  }

  const isLocal =
    typeof location !== "undefined" &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:");
  if (isLocal || githubVersions.length === 0) {
    const localEntry = { sha: "local", message: "Working Copy (Local Dumps)", date: new Date().toISOString() };
    return [localEntry, ...githubVersions];
  }
  return githubVersions;
}
