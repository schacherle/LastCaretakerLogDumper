import test from "node:test";
import assert from "node:assert/strict";
import { detectRepo, DEFAULT_REPO, isValidVersionSha } from "../js/api/github.js";

test("detectRepo and version validation", async (t) => {
  await t.test("respects valid ?repo= query override", () => {
    assert.strictEqual(
      detectRepo({ search: "?repo=custom-owner/custom.repo_1", hostname: "localhost", pathname: "/" }),
      "custom-owner/custom.repo_1"
    );
  });

  await t.test("rejects invalid ?repo= overrides (path traversal / scheme injection) and falls back", () => {
    assert.strictEqual(
      detectRepo({ search: "?repo=../../etc/passwd", hostname: "localhost", pathname: "/" }),
      DEFAULT_REPO
    );
    assert.strictEqual(
      detectRepo({ search: "?repo=https://evil.com/x", hostname: "localhost", pathname: "/" }),
      DEFAULT_REPO
    );
  });

  await t.test("detects owner/repo from github.io URLs", () => {
    assert.strictEqual(
      detectRepo({ search: "", hostname: "the1killer.github.io", pathname: "/LastCaretakerLogDumper/" }),
      "the1killer/LastCaretakerLogDumper"
    );
  });

  await t.test("falls back to DEFAULT_REPO on localhost or missing repo path", () => {
    assert.strictEqual(detectRepo({ search: "", hostname: "localhost", pathname: "/site/" }), DEFAULT_REPO);
    assert.strictEqual(detectRepo({ search: "", hostname: "user.github.io", pathname: "/" }), DEFAULT_REPO);
  });

  await t.test("isValidVersionSha allows hex SHAs and 'local' only", () => {
    assert.strictEqual(isValidVersionSha("local"), true);
    assert.strictEqual(isValidVersionSha("4da9eda"), true);
    assert.strictEqual(isValidVersionSha("4da9edafb547df247a5c5cf3032281a9065b345c"), true);
    assert.strictEqual(isValidVersionSha("../main"), false);
    assert.strictEqual(isValidVersionSha("not-hex!"), false);
    assert.strictEqual(isValidVersionSha(""), false);
  });
});
