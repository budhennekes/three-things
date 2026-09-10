# Amicro motion in Three Things Mobile

Browser-native adaptations of [Amicro](https://github.com/Subhan-code/Amicro--Micro-transitions-) by Syed Subhan Uddin. Source commit: `86b55340bfb939b8e93bb53aa46ba017c3449f1c`. Exact source URLs and SHA-256 hashes are in `amicro-sources.json`. The original MIT notice is preserved in `assets/Amicro-LICENSE.txt` and bundled in the offline app.

## Selected effects

- **Fade Up:** upstream `registry/ui/entrance/fade-up.tsx`. Preserve its easeOutExpo curve. Reduce movement from 20 px to 8 px and duration from 600 ms to 240 ms. Start at 70% opacity rather than hiding task content. Use on loaded period/day navigation and Focus stepping; do not replay during typing or on first load.
- **Zoom In:** upstream `registry/ui/entrance/zoom-in.tsx`. Settings opens at 98% scale and 75% opacity over 220 ms, with the upstream easing. Remove blur. Native dialog focus and dismissal remain immediate.
- **Tactile press:** upstream `src/components/AnimatedButton.tsx` tap scale `.96`, with the `snappy` spring from `registry/lib/presets.ts` (stiffness 400, damping 28, mass .8). Apply to small controls, not large period headings or editable text. Cancel on drag, scrolling, pointer cancellation, page hiding, and live Reduce Motion changes. Do not intercept the controls' native actions.

Implementation: `motion.js`, using the Web Animations API. No React, Tailwind, Motion runtime, CLI execution, external script, or network service is needed. This is an adaptation, not installation of the React components unchanged.

All added motion is finite and honors Reduce Motion. Task storage, appearance options, desktop behavior, and existing save-gated completion celebrations are unchanged. Mobile build hooks fail if their expected shared renderer anchors change.

## Completion pulse

Apple Pulse (`registry/ui/loading/apple-pulse-dots.tsx`) supplies the three-dot scale/opacity motif. Mobile uses one 900 ms pulse per dot, staggered by 150 ms, after the third priority saves successfully. It settles at full size, replaces the old completion flourish, and never loops or replays on wording edits or reload. Reduce Motion keeps static dots. The original app icon stays unchanged.

## Verification

Run `npm run build:mobile`, `npm run test:mobile-motion`, `npm run test:mobile`, and `npm test`. Use fresh browser contexts and synthetic priorities. Test hosted assets with `THREE_THINGS_MOBILE=https://budhennekes.github.io/three-things/app/`.

The service-worker cache version changes with the runtime files. Existing copies keep their current shell until the new worker installs and all old app tabs/windows close. Never clear site data to update: that can remove priorities.
