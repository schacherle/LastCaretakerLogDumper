# Scribe's Journal - LastCaretakerLogDumper

## 2026-11-11 - Static Frontend Architecture and Runtime JSDoc Standards
**Learning:** The web archive in `site/` runs without a build step or package manifest, executing directly in modern browsers by querying the GitHub REST API and raw file endpoints. Because it parses JSON payloads dynamically across various legacy character encodings (UTF-8 with BOM, UTF-16 LE) and exposes detailed deep-linking hash state protocols, standard JSDoc comments on `site/app.js` and dedicated architectural guides in `site/README.md` are essential for developer onboarding and preventing regressions in URL state handling.
**Action:** When updating or documenting `site/` files, ensure all link references use relative paths (`../.github/workflows/deploy.yml`), document local HTTP test server invocation with the `?repo=<owner>/<repo>` parameter, and maintain comprehensive JSDoc annotations across all DOM/hash orchestration routines.
