// Bounded, interruptible window movement. No timers remain after settling.
function animateBounds(from, to, { apply, done, reduced = () => false, duration = 190, now = () => performance.now(), schedule = fn => setTimeout(fn, 16), cancel = clearTimeout }) {
  const start = now(); let timer, settled = false;
  function finish() { if (settled) return; settled = true; cancel(timer); apply(to); done(); }
  function frame() {
    if (settled) return;
    const progress = Math.min(1, (now() - start) / duration);
    if (progress >= 1 || reduced()) { finish(); return; }
    const ease = 1 - (1 - progress) ** 3;
    apply(Object.fromEntries(['x','y','width','height'].map(k => [k, Math.round(from[k] + (to[k] - from[k]) * ease)])));
    timer = schedule(frame);
  }
  timer = schedule(frame);
  return finish;
}
module.exports = { animateBounds };
