# Three Things

**Make a few decisions once. Keep them close.**

Three Things is a small Mac desktop app for the priorities that deserve to stay in view. It has three spaces and three lines in each:

- **Today** for what needs your attention now.
- **This week** for the work that should not get lost in the days.
- **This month** for the bigger thing worth protecting.

That is the product. No inbox, streaks, scores, or project system.

## Why it exists

Most task apps reward collecting more work. Three Things makes a small constraint feel useful: decide what matters, keep it visible, and cross it off when it is real.

Use the full list when you are choosing. Use Focus for one item at a time. Use Mini to keep all three priorities in a slim horizontal bar on your desktop.

## A little extra, without a dashboard

- Priorities save locally on your Mac.
- Completed lines remain editable, so a typo does not undo an accomplishment.
- Pick a quiet photo or Graphite background.
- Export a plain-text copy from **File → Export Priorities**.
- Turn on **Always on Top** from Settings when you want it close.

## Run it locally

Requires Node.js 22+ and macOS.

```sh
npm install
npm start
```

Create a local Apple Silicon build:

```sh
npm run package:mac
```

The packaged ZIP appears in `dist/`. This prototype is not signed, notarized, or App Store ready yet.

## Privacy

Your priorities stay in the app's local data folder unless you choose to export them. The bundled backgrounds work offline. The app does not require an account or send task data to a service.

## Development

```sh
npm test
```

Photographic sources and licenses are recorded in `assets/PHOTO-CREDITS-v5.md` and `assets/photo-sources-v6.json`.

## License

MIT. See [LICENSE](LICENSE).
