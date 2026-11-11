#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITE_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    port: 8080,
    repo: "the1killer/LastCaretakerLogDumper",
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--port" || arg === "-p") {
      const next = argv[++i];
      const parsed = parseInt(next, 10);
      if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port specified: "${next}". Expected an integer between 1 and 65535.`);
      }
      options.port = parsed;
    } else if (arg.startsWith("--port=")) {
      const val = arg.split("=")[1];
      const parsed = parseInt(val, 10);
      if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port specified: "${val}". Expected an integer between 1 and 65535.`);
      }
      options.port = parsed;
    } else if (arg === "--repo" || arg === "-r") {
      const next = argv[++i];
      if (!next || !next.includes("/")) {
        throw new Error(`Invalid repo specified: "${next}". Expected format "owner/repo".`);
      }
      options.repo = next;
    } else if (arg.startsWith("--repo=")) {
      const val = arg.split("=")[1];
      if (!val || !val.includes("/")) {
        throw new Error(`Invalid repo specified: "${val}". Expected format "owner/repo".`);
      }
      options.repo = val;
    } else {
      throw new Error(`Unknown option: "${arg}". Use --help for usage instructions.`);
    }
  }

  return options;
}

export function printHelp() {
  console.log(`
🧭 Last Caretaker Archive - Local Development Server

Usage:
  npm run dev [-- [options]]
  node site/dev-server.mjs [options]

Options:
  -p, --port <number>    Port to listen on (default: 8080)
  -r, --repo <owner/repo> Default repository slug for data fetching (default: the1killer/LastCaretakerLogDumper)
  -h, --help             Show this help message and exit

Examples:
  npm run dev
  npm run dev -- --port 3000
  node site/dev-server.mjs --repo schacherle/LastCaretakerLogDumper
`);
}

export function createServer(options = {}) {
  const defaultRepo = options.repo || "the1killer/LastCaretakerLogDumper";

  return http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      let reqPath = decodeURIComponent(parsedUrl.pathname);

      if (reqPath === "/" || reqPath === "") {
        reqPath = "/index.html";
      }

      // First check within site/ directory
      let filePath = path.join(SITE_DIR, reqPath);
      let isWithinSite = filePath.startsWith(SITE_DIR);

      // If not in site/ (or if querying top-level assets like sampledata_images/ or *.json), check REPO_ROOT
      if (!fs.existsSync(filePath) || !isWithinSite) {
        const rootCandidate = path.join(REPO_ROOT, reqPath);
        if (rootCandidate.startsWith(REPO_ROOT) && fs.existsSync(rootCandidate)) {
          filePath = rootCandidate;
        }
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`404 Not Found: ${reqPath}\n`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      });

      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`500 Server Error: ${err.message}\n`);
    }
  });
}

export async function startServer(options = {}) {
  const port = options.port || 8080;
  const repo = options.repo || "the1killer/LastCaretakerLogDumper";
  const server = createServer({ repo });

  return new Promise((resolve, reject) => {
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `\n❌ Port ${port} is already in use by another process.\n` +
          `   Remediation steps:\n` +
          `   1. Identify and stop the process: lsof -i :${port} && kill <PID>\n` +
          `   2. Or start on an alternate port: npm run dev -- --port ${port + 1}\n`
        );
      } else {
        console.error(`\n❌ Failed to start dev server: ${err.message}`);
      }
      reject(err);
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}/?repo=${repo}`;
      console.log(`
┌─────────────────────────────────────────────────────────────┐
│  🧭 Last Caretaker Archive Dev Server Active                │
│                                                             │
│  ➜ Local URL:  ${url.padEnd(45)}│
│  ➜ Repo Target: ${(repo).padEnd(44)}│
│  ➜ Port:       ${String(port).padEnd(45)}│
│                                                             │
│  Press Ctrl+C to terminate the server.                      │
└─────────────────────────────────────────────────────────────┘
`);
      resolve({ server, port, repo, url });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      printHelp();
      process.exit(0);
    }
    await startServer(opts);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\nRun with --help for usage information.\n`);
    process.exit(1);
  }
}
