// Keep native Spaces transitions separate from List, Focus, and Compact.
function createFullscreen(win, {canEnter, changed, restoreBounds}) {
  let busy = false, normal = null, queue = Promise.resolve();
  win.on('enter-full-screen', () => {
    normal ||= win.getNormalBounds();
    win.setMaximumSize(0, 0);
    changed();
  });
  win.on('leave-full-screen', () => {
    const bounds = normal || win.getNormalBounds(); normal = null;
    restoreBounds(bounds); changed();
  });
  function request(value) {
    if (typeof value !== 'boolean') return Promise.reject(new Error('Invalid full-screen state'));
    const task = queue.then(async () => {
      if (value && !canEnter()) throw new Error('Expand Compact before entering full screen.');
      if (win.isFullScreen() === value) return;
      busy = true; changed();
      if (value) { normal = win.getNormalBounds(); win.setMaximumSize(0, 0); }
      try {
        await new Promise((resolve,reject) => {
          const event = value ? 'enter-full-screen' : 'leave-full-screen';
          // AppKit can report an early exit while its Space animation is still settling.
          // Keep competing requests queued until that short native transition finishes.
          const done = () => { clearTimeout(timer); setTimeout(resolve, 650); };
          const timer = setTimeout(() => { win.removeListener(event,done); reject(new Error('Full screen did not finish. Please try again.')); },10000);
          win.once(event,done);
          win.setFullScreen(value);
        });
      } finally { busy = false; changed(); }
    });
    queue = task.catch(()=>{});
    return task;
  }
  return {request,get busy(){return busy;},get idle(){return queue;}};
}
module.exports = {createFullscreen};
