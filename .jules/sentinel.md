# Sentinel's Journal

## 2025-05-18 - Client-Side Hardening for GitHub Pages Static Archives
**Learning:** Static web viewers deployed on GitHub Pages that fetch dynamic content from GitHub API and raw content endpoints based on URL parameters (such as `?repo=` and location hash fragments) are susceptible to SSRF/untrusted origin fetching, path traversal, script injection via compromised CDNs, and DOM injection. Enforcing strict regex validation on repository slugs (`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`) and commit SHAs, utilizing Subresource Integrity (SRI) on CDN scripts, and configuring a strict meta Content Security Policy (CSP) provide defense-in-depth without breaking static hosting workflows.
**Action:** Always pair client-side URL parameter detection with strict format whitelisting, configure CSP with minimal necessary origins, and pin third-party external scripts with SRI hashes.
