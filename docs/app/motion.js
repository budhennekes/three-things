/* Amicro motion adaptations; see assets/Amicro-LICENSE.txt and mobile/AMICRO.md. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map();
  let pressed = null;
  const ease = 'cubic-bezier(.16,1,.3,1)';
  function cancel(element) {
    active.get(element)?.cancel();
    active.delete(element);
  }
  function play(element, frames, options) {
    cancel(element);
    if (!element || reduced.matches || document.hidden || !element.getClientRects().length) return;
    const animation = element.animate(frames, options);
    active.set(element, animation);
    animation.finished.catch(() => {}).finally(() => {
      if (options.fill !== 'forwards' && active.get(element) === animation) active.delete(element);
    });
  }
  function stop() { pressed = null; for (const element of active.keys()) cancel(element); }
  function fadeUp(element) {
    if (element?.contains(document.activeElement)) return;
    play(element, [{opacity:.7,transform:'translateY(8px)'},{opacity:1,transform:'none'}],
      {id:'amicro-fade-up',duration:240,easing:ease});
  }
  function zoomIn(element) {
    play(element, [{opacity:.75,transform:'scale(.98)'},{opacity:1,transform:'none'}],
      {id:'amicro-zoom-in',duration:220,easing:ease});
  }
  // Amicro AnimatedButton's .96 tap scale with its snappy spring preset.
  // Sample the damped spring once per release; no animation loop or dependency.
  function release(hard = false) {
    if (!pressed) return;
    const element = pressed.element;
    pressed = null;
    if (hard) { cancel(element); return; }
    const from = new DOMMatrixReadOnly(getComputedStyle(element).transform).a;
    const stiffness=400,damping=28,mass=.8;
    const decay=damping/(2*mass), frequency=Math.sqrt(stiffness/mass-decay*decay);
    const frames=Array.from({length:25},(_,i)=>{
      const t=i/24*.36;
      const remaining=Math.exp(-decay*t)*(Math.cos(frequency*t)+decay/frequency*Math.sin(frequency*t));
      return {transform:`scale(${i===24?1:1+(from-1)*remaining})`};
    });
    play(element,frames,{id:'amicro-release',duration:360,easing:'linear'});
  }
  function press(element, pointerId, x, y) {
    release(true);
    if (!element || element.disabled || element.closest('[inert]') || reduced.matches || document.hidden) return;
    pressed={element,pointerId,x,y};
    play(element,[{transform:getComputedStyle(element).transform},{transform:'scale(.96)'}],
      {id:'amicro-press',duration:90,easing:ease,fill:'forwards'});
  }
  const controls='.window-actions button,#mobile-settings button,#one-more,#focus-navigation button,.date-navigation button,#compact-tools button,#compact-period,.cancel-extra';
  document.addEventListener('pointerdown',event=>{
    if (event.button!==0 || !event.isPrimary) return;
    press(event.target.closest(controls),event.pointerId,event.clientX,event.clientY);
  });
  document.addEventListener('pointerup',event=>{if(pressed?.pointerId===event.pointerId)release();});
  document.addEventListener('pointercancel',()=>release(true));
  document.addEventListener('pointermove',event=>{
    if(pressed?.pointerId===event.pointerId && Math.hypot(event.clientX-pressed.x,event.clientY-pressed.y)>8)release(true);
  },{passive:true});
  document.addEventListener('scroll',()=>release(true),{capture:true,passive:true});
  document.addEventListener('keydown',event=>{
    if(!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && ['Enter',' '].includes(event.key))
      press(event.target.closest(controls),'keyboard',0,0);
  });
  document.addEventListener('keyup',event=>{if(['Enter',' '].includes(event.key)&&pressed?.pointerId==='keyboard')release();});
  window.addEventListener('blur',stop);
  reduced.addEventListener('change', () => { if (reduced.matches) stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  // Never move an editor under the caret when typing begins mid-transition.
  document.addEventListener('focusin', event => {
    if (event.target.matches('textarea,input:not([type="checkbox"])')) {
      for (const element of active.keys()) if (element.contains(event.target)) cancel(element);
    }
  });
  window.threeMotion = {fadeUp,zoomIn,cancel,stop};
})();
