# Palette Journal - UI & Accessibility Learnings

## 2026-11-11 - Scrollable Containers & Retro Terminal Keyboard Affordance
**Learning:** In terminal/dashboard styling with fixed-height scroll regions (`overflow-y: auto`), keyboard-only users cannot scroll through content unless the container explicitly has `tabindex="0"`, a landmark/region role, and an accessible label (`aria-label`). Furthermore, custom interactive list items styled with `div` require explicit `role="button"`, `tabindex="0"`, and keydown handlers for both `Enter` and `Space`.
**Action:** Always verify scrollable panes are focusable by keyboard, interactive rows include `role="button"` and `tabindex="0"`, and tab switches announce ARIA state updates.
