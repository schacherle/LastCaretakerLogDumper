# Bolt's Journal - LastCaretakerLogDumper

## 2026-11-11 - Static Web Archive Frontend Memoization & Event RAF Coalescing
**Learning:** The static web archive in `site/` processes JSON dumps directly in browser memory without a bundler or backend service. Eager re-filtering of all views on scope switch and repeated regrouping/Regex parsing of subtitle arrays during every filter keystroke generated avoidable CPU bottlenecks (~383ms per 1,000 keystroke events). Furthermore, high-frequency DOM event listeners on `scroll`, `resize`, and `selectionchange` triggered synchronous geometry reflows via `getBoundingClientRect()`.
**Action:** Memoize subtitle grouping and pre-index normalized `.toLowerCase()` search haystacks onto data records upon version loading; scope list rendering to the active tab only; eliminate regex parsing in comparator hot-paths (`sampleIdSortKey`); and coalesce floating selection toolbar positioning inside `requestAnimationFrame`.
