import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { parseArgs, createServer, startServer } from "../dev-server.mjs";

test("parseArgs parses default arguments correctly", () => {
  const opts = parseArgs([]);
  assert.equal(opts.port, 8080);
  assert.equal(opts.repo, "the1killer/LastCaretakerLogDumper");
  assert.equal(opts.help, false);
});

test("parseArgs parses flags with values", () => {
  const opts = parseArgs(["--port", "9000", "--repo", "custom-owner/custom-repo"]);
  assert.equal(opts.port, 9000);
  assert.equal(opts.repo, "custom-owner/custom-repo");
});

test("parseArgs parses inline flags (--flag=value)", () => {
  const opts = parseArgs(["--port=4000", "--repo=test/project"]);
  assert.equal(opts.port, 4000);
  assert.equal(opts.repo, "test/project");
});

test("parseArgs rejects invalid port values", () => {
  assert.throws(() => parseArgs(["--port", "not-a-number"]), /Invalid port specified/);
  assert.throws(() => parseArgs(["--port", "-5"]), /Invalid port specified/);
  assert.throws(() => parseArgs(["--port", "999999"]), /Invalid port specified/);
});

test("parseArgs rejects invalid repo formats", () => {
  assert.throws(() => parseArgs(["--repo", "invalid-repo-without-slash"]), /Invalid repo specified/);
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--unknown-flag"]), /Unknown option/);
});

test("dev-server serves index.html and static assets with correct headers", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    const body = await res.text();
    assert.match(body, /<title>Last Caretaker Archive/);

    const jsRes = await fetch(`http://localhost:${port}/app.js`);
    assert.equal(jsRes.status, 200);
    assert.equal(jsRes.headers.get("content-type"), "text/javascript; charset=utf-8");

    const cssRes = await fetch(`http://localhost:${port}/styles.css`);
    assert.equal(cssRes.status, 200);
    assert.equal(cssRes.headers.get("content-type"), "text/css; charset=utf-8");

    const missingRes = await fetch(`http://localhost:${port}/does-not-exist.json`);
    assert.equal(missingRes.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dev-server handles port conflict with actionable error message", async () => {
  const blocker = http.createServer();
  await new Promise((resolve) => blocker.listen(0, resolve));
  const port = blocker.address().port;

  let errorCaptured = null;
  try {
    await startServer({ port });
  } catch (err) {
    errorCaptured = err;
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }

  assert.ok(errorCaptured, "Expected startServer to reject due to EADDRINUSE");
  assert.equal(errorCaptured.code, "EADDRINUSE");
});
