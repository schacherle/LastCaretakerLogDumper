# Inspector's Journal

## 2025-05-18 - Isolated Node test runner harness for static browser app
**Learning:** `site/app.js` runs in standard browser environments without module loaders or bundlers, loading Diff from a CDN and mutating DOM globals. To test its pure business logic, helpers, parsers, and transformers deterministically without altering production files (or requiring a bundler), we can evaluate `site/app.js` within a sandboxed `node:vm` context exposing browser mock globals.
**Action:** Use Node's built-in `node:test` and `node:assert` runner with an in-memory VM context harness located in `site/tests/` to test all business logic, data parsers, diffing, encoding/decoding, and state management deterministically.
