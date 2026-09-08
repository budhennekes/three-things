const fs = require('node:fs');
const MODES = {
  list: { width: 390, height: 376, minWidth: 320, minHeight: 340, maxWidth: 900, maxHeight: 950 },
  focus: { width: 390, height: 310, minWidth: 320, minHeight: 270, maxWidth: 900, maxHeight: 950 },
  compact: { width: 680, height: 98, minWidth: 600, minHeight: 98, maxWidth: 1100, maxHeight: 98 },
};
function validBounds(bounds) {
  return bounds && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(bounds[k])) && bounds.width > 0 && bounds.height > 0;
}
function clampBounds(bounds, area, mode) {
  const limits = MODES[mode] || MODES.list;
  const input = validBounds(bounds) ? bounds : { x: area.x + area.width - limits.width - 32, y: area.y + 60, ...limits };
  const width = Math.round(Math.min(area.width, Math.max(limits.minWidth, Math.min(limits.maxWidth, input.width))));
  const height = Math.round(Math.min(area.height, Math.max(limits.minHeight, Math.min(limits.maxHeight, input.height))));
  return { x: Math.round(Math.max(area.x, Math.min(input.x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(input.y, area.y + area.height - height))), width, height };
}
function readView(file) {
  const fallback = { mode: 'list', expandedMode: 'list', pin: false, backdrop: 'opaque', autoAdvance: false, bounds: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { mode: Object.hasOwn(MODES, raw.mode) ? raw.mode : 'list', expandedMode: raw.expandedMode === 'focus' ? 'focus' : 'list', pin: raw.pin === true, backdrop: 'opaque', autoAdvance: raw.autoAdvance === true,
      bounds: Object.fromEntries(Object.entries(raw.bounds || {}).filter(([mode, b]) => Object.hasOwn(MODES, mode) && validBounds(b))) };
  } catch { return fallback; }
}
function writeView(file, view) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(view), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
module.exports = { MODES, clampBounds, readView, writeView };
