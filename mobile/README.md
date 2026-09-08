# Three Things mobile web app

Build: `npm run build:mobile`.
Test: `npm run test:mobile` (headless Chrome and Playwright WebKit required).

The build writes an explicit static allowlist to `docs/app/`, served at `/three-things/app/` on GitHub Pages. Do not hand-edit generated files. It reuses the shared desktop renderer and validated period model; `bridge.js` supplies atomic IndexedDB persistence instead of Electron IPC/filesystem operations. Mobile styling and settings live here. The Mac binary is not part of this deployment.

## Data and updates

- Database: `three-things-mobile-v1`; no accounts, cloud sync, task upload, or analytics.
- Revisions prevent a stale tab from overwriting a newer list. On conflict, retain the visible draft and ask the user to copy it before reloading.
- Clear and Undo are independent per period. Preserve them across reloads.
- JSON backups include priorities, extras, completion and Undo. Restore adds absent dates only; it does not replace an existing period, including an intentionally cleared one.
- Browser/Home Screen storage is not encryption or a guaranteed backup. Clearing site data may remove it. Do not claim Safari tabs, Home Screen copies, or Mac files automatically share data.
- The service worker caches only bundled static files, under this app's subpath. Its content-derived cache version never forces a reload over active work. A waiting update activates after the old clients close.
- Do not use test fixtures in a user's real browser context. The test starts a docs-only localhost server, exercises isolated databases, then shuts the server down to verify offline reload/save.
- Browser tests are not physical iPhone keyboard, VoiceOver, or Home Screen installation verification.

## Photograph and asset sources

Mobile uses reduced-size copies of the existing licensed app assets; originals are preserved.

- Meadow: https://unsplash.com/photos/d5ChyDj4Mwk — see `assets/photo-sources-v6.json`.
- Sunroom: MAHDI HAJIZADE, https://unsplash.com/photos/the-sunlight-is-shining-through-a-window-in-a-building-cF71DVQjR4o — see `assets/PHOTO-CREDITS-v5.md`.
- Both photographs use the Unsplash License: https://unsplash.com/license.
- Inter and Heroicons license text is included in the generated app assets. The three-line app icon is the existing project artwork.
