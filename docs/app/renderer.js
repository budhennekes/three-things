const api = window.threeThings;
const list = document.querySelector('#priorities');
const appElement = document.querySelector('.app');
const tabs = [...document.querySelectorAll('[role=tab]')];
let scope = 'day', key, rows, revision = 0, savedRevision = 0;
let savePromise = null, switching = false, loaded = false, rolloverBusy = false;
let extras = [], completedOnce = false, savedAllComplete = false, finishTimer;
let retryScope = null, actionGeneration = 0;
let mode = 'list', focusedIndex = 0, requestedFocus = null, fullScreen = false;
let autoAdvance = false, advanceCandidate = null, advanceTimer;
function cancelAdvance() { clearTimeout(advanceTimer); advanceCandidate = null; }
function applyPreferences(state) {
  fullScreen = !!state.fullScreen; document.documentElement.dataset.fullscreen = String(fullScreen);
  document.querySelector('#exit-fullscreen').hidden = !fullScreen;
  document.querySelector('#exit-fullscreen').disabled = !!state.fullscreenBusy;
  autoAdvance = false; // All three tasks remain visible in Mini; no automatic navigation.
  document.documentElement.dataset.backdrop = state.backdrop || 'opaque';
  if (!autoAdvance) cancelAdvance();
}
function scheduleNext() {
  const candidate = advanceCandidate, saved = revision; advanceCandidate = null;
  if (!candidate || !autoAdvance) return;
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    if (document.hidden || switching || mode !== 'compact' || key !== candidate.key || scope !== candidate.scope || focusedIndex !== candidate.index || revision !== saved || !rows[candidate.index].done) return;
    const next = [1,2].map(delta => (candidate.index+delta)%3).find(index => !rows[index].done && rows[index].text.trim());
    if (next !== undefined) { focusedIndex = next; applyModeLayout(); enterMotion(list.querySelectorAll('.priority')[next]); }
  },550);
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = new Map();
function enterMotion(element, fold = false) {
  motion.get(element)?.cancel();
  if (reducedMotion.matches || document.hidden) return;
  const animation = element.animate([
    { opacity: .65, transform: fold ? 'translateY(-3px) scaleY(.97)' : 'translateY(3px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: fold ? 190 : 140, easing: 'cubic-bezier(.2,.7,.2,1)' });
  motion.set(element, animation);
  animation.finished.catch(() => {}).finally(() => { if (motion.get(element) === animation) motion.delete(element); });
}
function stopMotion() { for (const animation of motion.values()) animation.cancel(); motion.clear(); appElement.classList.remove('celebrate'); }
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) stopMotion(); void api?.motion(reducedMotion.matches); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopMotion(); cancelAdvance(); } });
async function focusPriority(index) {
  if (!loaded || switching) return;
  requestedFocus = index; focusedIndex = index; applyModeLayout();
  await requestMode('focus'); requestedFocus = null;
  list.querySelectorAll('textarea')[index]?.focus();
}


function periodLabel(value) {
  const [y, m, d] = value.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12);
  if (scope === 'month') return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (scope === 'day') return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const end = new Date(y, m - 1, d + 6, 12);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
function render() {
  appElement.classList.remove('celebrate');
  updateDayNavigation();
  tabs.forEach(tab => {
    const selected = tab.dataset.scope === scope;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelector('#priority-panel').setAttribute('aria-labelledby', `${scope}-tab`);
  list.setAttribute('aria-label', {day: "Today's three priorities", week: "This week's three priorities", month: "This month's three priorities"}[scope]);
  list.replaceChildren();
  rows.forEach((row, i) => {
    const li = document.createElement('li'); li.className = 'priority'; li.dataset.index = i;
    const wrap = document.createElement('label'); wrap.className = 'check-wrap';
    const check = document.createElement('input');
    check.type = 'checkbox'; check.name = `complete-${i + 1}`;
    check.checked = row.done; check.disabled = !row.text.trim();
    check.setAttribute('aria-label', `Complete priority ${i + 1}`);
    const number = document.createElement('span'); number.className = 'number';
    number.textContent = String(i + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
    check.title = (row.done ? 'Mark as not done' : 'Mark as done') + ' · Option-click to Focus';
    // Heroicons Micro check, v2.2.0 (MIT). See assets/Heroicons-LICENSE.txt.
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 16 16'); icon.classList.add('check-icon');
    icon.setAttribute('aria-hidden', 'true');
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('fill-rule', 'evenodd'); iconPath.setAttribute('clip-rule', 'evenodd');
    iconPath.setAttribute('d', 'M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z');
    icon.append(iconPath);
    const completionLabel = document.createElement('span'); completionLabel.className = 'completion-label'; completionLabel.textContent = row.done ? 'Undo' : 'Mark done';
    wrap.append(check, icon, completionLabel);
    const textWrap = document.createElement('div'); textWrap.className = 'text-wrap';
    const text = document.createElement('textarea');
    text.name = `priority-${i + 1}`; text.rows = 1; text.maxLength = 240;
    text.value = row.text; text.placeholder = `Priority ${i + 1}`;
    text.setAttribute('aria-label', `Priority ${i + 1}`);
    // Completion records status, not edit permission. A completed line can still be corrected.
    text.spellcheck = true;
    const ink = document.createElement('div'); ink.className = 'ink'; ink.setAttribute('aria-hidden', 'true');
    const inkText = document.createElement('span'); inkText.textContent = row.text; ink.append(inkText);
    text.addEventListener('input', () => {
      row.text = text.value; inkText.textContent = row.text;
      if (!row.text.trim() && row.done) { row.done = false; check.checked = false; completionLabel.textContent = 'Mark done'; check.title = 'Mark as done'; li.classList.remove('just-checked'); }
      check.disabled = !row.text.trim(); changed();
    });
    text.addEventListener('focus', () => li.classList.add('editing'));
    text.addEventListener('blur', () => li.classList.remove('editing'));
    text.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (row.done || mode !== 'list') { text.blur(); return; }
        const next = list.querySelectorAll('textarea')[i + 1];
        if (next) next.focus(); else text.blur();
      }
    });
    check.addEventListener('click', event => { if (event.altKey) { event.preventDefault(); void focusPriority(i); } });
    check.addEventListener('change', () => {
      row.done = check.checked; completionLabel.textContent = row.done ? 'Undo' : 'Mark done';
      cancelAdvance();
      if (row.done && autoAdvance && mode === 'compact') advanceCandidate = {index:i,key,scope};
      check.title = (row.done ? 'Mark as not done' : 'Mark as done') + ' · Option-click to Focus';
      li.classList.toggle('just-checked', row.done);
      if (row.done) setTimeout(() => li.classList.remove('just-checked'), 500);
      changed();
    });
    textWrap.addEventListener('click', () => { if (mode === 'compact') void focusPriority(i); });
    textWrap.addEventListener('keydown', event => { if (mode === 'compact' && ['Enter',' '].includes(event.key)) { event.preventDefault(); void focusPriority(i); } });
    textWrap.append(text, ink); li.append(number, textWrap, wrap); list.append(li);
  });
  refresh();
}
function refresh() {
  const count = rows.filter(row => row.done).length;
  appElement.classList.toggle('finished', count === 3 && savedAllComplete);
  const progressText = `${count} of 3 ${{day:'daily',week:'weekly',month:'monthly'}[scope]} priorities complete.`;
  if (document.querySelector('#progress-text').textContent !== progressText) document.querySelector('#progress-text').textContent = progressText;
  if (count !== 3) appElement.classList.remove('celebrate');
  applyModeLayout();
  updateFinish(); updateDayActions();
}
function applyModeLayout() {
  document.documentElement.dataset.mode = mode;
  document.querySelector('#focus-toggle').textContent = mode === 'focus' ? 'List' : 'Focus';
  document.querySelector('#focus-toggle').setAttribute('aria-pressed', String(mode === 'focus'));
  document.querySelector('#focus-toggle').title = mode === 'focus' ? 'Show all three priorities' : 'Show one priority at a time';
  document.querySelector('#compact-period').hidden = mode !== 'compact';
  document.querySelector('#expand').hidden = mode !== 'compact';
  document.querySelector('#compact-tools').hidden = mode !== 'compact';
  document.querySelector('#focus-navigation').hidden = mode !== 'focus';
  document.querySelector('#compact-period').textContent = {day:dayName(),week:'This week',month:'This month'}[scope];
  document.querySelector('#position').textContent = `${focusedIndex + 1} / 3`;
  document.querySelector('#next-unfinished').hidden = mode !== 'focus' || !rows[focusedIndex].done || !rows.some(row => !row.done && row.text.trim());
  document.querySelector('#all-complete').hidden = true;
  document.querySelector('#previous').disabled = switching || focusedIndex === 0;
  document.querySelector('#next').disabled = switching || focusedIndex === 2;
  list.querySelectorAll('.priority').forEach((li, i) => {
    li.hidden = mode === 'focus' && i !== focusedIndex;
    const textWrap = li.querySelector('.text-wrap');
    if (mode === 'compact') {
      textWrap.setAttribute('role', 'button'); textWrap.tabIndex = 0;
      textWrap.setAttribute('aria-label', `${rows[i].text || 'Write priority ' + (i + 1)}. Open in Focus to edit.`);
      textWrap.title = rows[i].text || 'Open in Focus to write this priority';
    } else {
      textWrap.removeAttribute('role'); textWrap.removeAttribute('tabindex'); textWrap.removeAttribute('aria-label'); textWrap.removeAttribute('title');
    }
  });
}
function applyView(state) {
  applyPreferences(state);
  if (state.settingsSaved) document.querySelector('#view-notice').hidden = true;
  const previous = mode; mode = state.mode;
  if (previous !== mode) cancelAdvance();
  if (!rows) return;
  if (mode === 'compact' && !document.querySelector('#error').hidden) { void requestMode('focus'); }
  if (requestedFocus !== null) focusedIndex = requestedFocus;
  else if (previous === 'list' && mode === 'focus') focusedIndex = Math.max(0, rows.findIndex(row => !row.done));
  document.documentElement.dataset.folding = String(!!state.folding);
  applyModeLayout();
  if (previous !== mode && state.animate) enterMotion(document.querySelector('main'), true);
}
function showNotice(message) {
  const notice = document.querySelector('#view-notice'); notice.textContent = message; notice.hidden = false;
  if (mode === 'compact') void requestMode('focus');
}
async function requestMode(next) {
  cancelAdvance();
  try { await api.mode(next); }
  catch { showNotice('Could not change the window. Please try again.'); }
}
function stepPriority(delta) {
  cancelAdvance();
  if (switching) return;
  focusedIndex = Math.max(0, Math.min(2, focusedIndex + delta));
  applyModeLayout();
  enterMotion(list.querySelectorAll('.priority')[focusedIndex]);
}
document.querySelectorAll('.settings-trigger').forEach(button => button.addEventListener('click', () => { cancelAdvance(); void api.settings().catch(() => showNotice('Could not open Settings. Use Three Things → Settings.')); }));
document.querySelector('#focus-toggle').addEventListener('click', () => { void requestMode(mode === 'focus' ? 'list' : 'focus'); });
document.querySelector('#compact-toggle').addEventListener('click', () => { void requestMode('compact'); });
document.querySelector('#exit-fullscreen').addEventListener('click',()=>{void api.fullscreen(false).catch(()=>showNotice('Could not exit full screen. Try View → Exit Full Screen.'));});
document.querySelector('#expand').addEventListener('click', () => { void requestMode('expand'); });
document.querySelector('#previous').addEventListener('click', () => stepPriority(-1));
document.querySelector('#next').addEventListener('click', () => stepPriority(1));
document.querySelector('#next-unfinished').addEventListener('click', () => { const next = [1,2].map(delta => (focusedIndex + delta) % 3).find(i => !rows[i].done && rows[i].text.trim()); if (next !== undefined) stepPriority(next - focusedIndex); });
document.querySelector('#compact-period').addEventListener('click', () => { void switchScope(['day','week','month'][(['day','week','month'].indexOf(scope)+1)%3]); });
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && fullScreen) { event.preventDefault(); void api.fullscreen(false).catch(()=>showNotice('Could not exit full screen. Try View → Exit Full Screen.')); return; }
  if (event.key === 'Escape' && mode !== 'list') { event.preventDefault(); void requestMode(mode === 'compact' ? 'expand' : 'list'); }
});

function changed() { revision++; retryPeriodAction = null; refresh(); void flush(); }
function showError(message) {
  if (mode === 'compact') void requestMode('focus');
  document.querySelector('#error').hidden = false;
  document.querySelector('#error-text').textContent = message;
  document.querySelector('#save-state').textContent = 'Not saved';
}
function flush() {
  if (savePromise) return savePromise;
  if (savedRevision === revision) return Promise.resolve(true);
  document.querySelector('#save-state').textContent = 'Saving…';
  let justCompleted = false;
  savePromise = (async () => {
    try {
      while (savedRevision < revision) {
        const current = revision;
        const result = await api.save({ scope, key, rows: rows.map(row => ({ ...row })), extras: extras.map(row=>({...row})) });
        if (!result.ok) throw new Error(result.error);
        savedRevision = current;
        completedOnce = result.completedOnce; savedAllComplete = result.allComplete; canUndoClear = !!result.canUndoClear;
        justCompleted = justCompleted || result.justCompleted;
      }
      document.querySelector('#error').hidden = true;
      document.querySelector('#save-state').textContent = 'Saved on this device';
      refresh();
      if (justCompleted && rows.every(row=>row.done)) finishMoment();
      scheduleNext();
      return true;
    } catch (error) {
      showError(error.message || 'Could not save. Your changes are still here. Try again.');
      return false;
    } finally { savePromise = null; }
  })();
  return savePromise;
}
function setBusy(value) {
  if (value) actionGeneration++;
  switching = value; list.inert = value; document.querySelector('#finish').inert = value; document.querySelector('#day-actions').inert = value;
  document.querySelector('#priority-panel').setAttribute('aria-busy', String(value));
  tabs.forEach(tab => { tab.disabled = value; });
  document.querySelector('#compact-period').disabled = value;
  if (rows) { applyModeLayout(); updateFinish(); updateDayActions(); updateDayNavigation(); }
}
function adopt(state) {
  actionGeneration++;
  cancelAdvance(); applyPreferences(state);
  document.documentElement.dataset.skin = state.skin || 'graphite';
  retryScope = null; retryPeriodAction = null; canUndoClear = !!state.canUndoClear;
  scope = state.scope; key = state.key; rows = state.rows; todayKey = state.todayKey;
  extras = state.extras || []; completedOnce = !!state.completedOnce; savedAllComplete = rows.every(row=>row.done);
  clearTimeout(finishTimer);
  focusedIndex = Math.max(0, rows.findIndex(row => !row.done));
  if (!loaded) mode = state.mode || 'list';
  revision = 0; savedRevision = 0;

  document.querySelector('#error').hidden = true;
  document.querySelector('#save-state').textContent = 'Saved on this device';
  render(); renderExtras();
}
async function switchScope(next) {
  cancelAdvance();
  if (next === 'day' && scope === 'day' && browsingDay) return changeDay(null);
  if (!loaded || switching || next === scope) return;
  setBusy(true);
  try {
    if (!await flush()) return;
    const state = await api.load(next); browsingDay = null; adopt(state);
  } catch { retryScope = next; showError('Could not open these priorities. Your current list is still here. Try again.'); }
  finally { setBusy(false); }
}
async function rollover() {
  if (!loaded || switching || rolloverBusy || savePromise) return;
  rolloverBusy = true;
  const previousScope = scope, previousKey = key, previousRevision = revision, generation = actionGeneration;
  try {
    if (savedRevision !== revision) return;
    const state = await api.load(scope, scope === 'day' ? browsingDay : null);
    if (actionGeneration !== generation || switching || scope !== previousScope || key !== previousKey || revision !== previousRevision || savePromise) return;
    todayKey = state.todayKey;
    if (browsingDay === todayKey) browsingDay = null;
    if (state.key !== key) adopt(state); else { updateDayNavigation(); updateDayActions(); }
  } catch { /* Keep the current list when a background check fails. */ }
  finally { rolloverBusy = false; }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => { void switchScope(tab.dataset.scope); });
  tab.addEventListener('keydown', async event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    await switchScope(target.dataset.scope);
    tabs.find(item => item.dataset.scope === scope).focus();
  });
});
document.querySelector('#retry').addEventListener('click', () => {
  if (retryPeriodAction) void changePeriod(retryPeriodAction);
  else if (retryScope) void switchScope(retryScope); else void flush();
});
window.addEventListener('beforeunload', event => {
  if (switching || savedRevision !== revision) { event.preventDefault(); event.returnValue = ''; void flush(); }
});
window.addEventListener('focus', rollover);
setInterval(rollover, 15000);
async function start() {
  try {
    if (!api) throw new Error('Open Three Things as a desktop app.');
    await api.motion(reducedMotion.matches);
    api.onExport(async () => {
      if (!loaded || switching || !await flush()) return;
      const result = await api.export().catch(() => ({ok:false}));
      if (result.cancelled) return;
      if (!result.ok) { showNotice(result.error || 'Could not export. Your priorities are unchanged. Try File → Export Priorities again.'); return; }
      document.querySelector('#save-state').textContent = 'Plain-text export saved.';
      setTimeout(() => { const status = document.querySelector('#save-state'); if (status.textContent === 'Plain-text export saved.') status.textContent = 'Saved on this device'; }, 2000);
    });
    api.onPause(() => { cancelAdvance(); stopMotion(); });
    api.onSkin(value => { document.documentElement.dataset.skin = value; });
    api.onView(applyView);
    api.onNotice(showNotice);
    api.onPeriod(value => { void switchScope(value); });
    adopt(await api.load('day')); loaded = true;
  } catch (error) {
    showError(error.message); document.querySelector('#retry').hidden = true;
    tabs.forEach(tab => { tab.disabled = true; });
  }
}
const tip = document.querySelector('#quick-tip'), help = document.querySelector('#help-toggle');
function showTip(open) { tip.hidden = !open; help.setAttribute('aria-expanded', String(open)); }
function dismissTip() { showTip(false); try { localStorage.setItem('three-things-tip-v1', 'seen'); } catch {} }
help.addEventListener('click', () => { if (tip.hidden) showTip(true); else dismissTip(); });
document.querySelector('#tip-dismiss').addEventListener('click', dismissTip);
window.addEventListener('keydown', event => { if (event.key === 'Escape' && !tip.hidden) { dismissTip(); help.focus(); } });
// Keep first launch quiet. The visible ? is a discoverable, non-blocking help affordance.
try { showTip(false); } catch { showTip(false); }
void start();
