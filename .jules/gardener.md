# Gardener Journal

Critical learnings regarding codebase hygiene and maintenance.

## 2026-11-04 - Browser ES Modules & Global Linter Rules for site/
**Learning:** `site/` is a zero-dependency static frontend that runs directly in the browser via GitHub Pages without a package.json build pipeline. When performing static analysis and linting, Node/ESLint requires configuring browser globals and the Diff global without introducing local node_modules artifacts into the git repository.
**Action:** When validating `site/` files, use global tooling (`npm root -g`) or programmatic Linter APIs to avoid modifying repository root config or manifests.
