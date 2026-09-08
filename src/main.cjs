const { app, BrowserWindow, ipcMain, Menu, dialog, screen, Tray, nativeImage, systemPreferences, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store, dayKey, weekKey } = require('./store.cjs');
const { MODES, clampBounds, readView, writeView } = require('./window-state.cjs');
const { animateBounds } = require('./bounds-motion.cjs');
const { createFullscreen } = require('./fullscreen.cjs');
const { formatArchive, writeTextExport } = require('./text-export.cjs');
let exporting = false, fullscreen;
const catalog = require('../assets/appearance-catalog-v5.json');
const skins = Object.fromEntries(catalog.map(({name,...info}) => [name,info]));
if (process.env.THREE_THINGS_TEST_DATA) app.setPath('userData', process.env.THREE_THINGS_TEST_DATA);
app.setName('Three Things');
let win, store, tray, trayMenu, settingsMenu, skinFile, viewFile, view, skin = 'graphite', mode = 'list';
let quitting = false, changingMode = false, viewTimer, finishResize, rendererReduced = false;
function reduceMotion() { return rendererReduced || systemPreferences.getAnimationSettings().prefersReducedMotion; }
function broadcast(channel, value) { if (win && !win.isDestroyed()) win.webContents.send(channel, value); }
function viewState() { return { mode, expandedMode: view.expandedMode, pin: view.pin, backdrop: effectiveBackdrop(), preferredBackdrop: view.backdrop, autoAdvance: view.autoAdvance, folding: changingMode, fullScreen:!!win?.isFullScreen(), fullscreenBusy:!!fullscreen?.busy }; }
function saveView() {
  clearTimeout(viewTimer);
  if (!view || !win || win.isDestroyed() || changingMode) return;
  if (!win.isMinimized() && !win.isFullScreen() && !fullscreen?.busy) view.bounds[mode] = win.getNormalBounds();
  try { writeView(viewFile, { ...view, mode }); }
  catch { broadcast('view:notice', 'Could not remember the window position. Your priorities are unaffected.'); }
}
function queueViewSave() { if (!changingMode) { clearTimeout(viewTimer); viewTimer = setTimeout(saveView, 250); } }
function fitBounds(bounds, targetMode) {
  const area = bounds ? screen.getDisplayMatching(bounds).workArea : screen.getPrimaryDisplay().workArea;
  return clampBounds(bounds, area, targetMode);
}
function constraints(targetMode) {
  const limits = MODES[targetMode];
  win.setMinimumSize(limits.minWidth, limits.minHeight);
  win.setMaximumSize(win.isFullScreen() ? 0 : limits.maxWidth, win.isFullScreen() ? 0 : limits.maxHeight);
  if (win.isFullScreenable() !== (targetMode !== 'compact')) win.setFullScreenable(targetMode !== 'compact');
  if (!win.isFullScreen()) win.setWindowButtonVisibility(targetMode !== 'compact');
}
function syncMenus() {
  for (const menu of [Menu.getApplicationMenu(), trayMenu, settingsMenu]) {
    if (!menu) continue;
    const fullItem = menu.getMenuItemById('fullscreen');
    if (fullItem) { fullItem.enabled = mode !== 'compact' && !fullscreen?.busy; fullItem.label = win?.isFullScreen() ? 'Exit Full Screen' : 'Enter Full Screen'; }
    const modeItem = menu.getMenuItemById('mode-' + mode); if (modeItem) modeItem.checked = true;
    const pinItem = menu.getMenuItemById('pin'); if (pinItem) pinItem.checked = view.pin;
    const skinItem = menu.getMenuItemById('skin-' + skin); if (skinItem) skinItem.checked = true;
    const backdropItem = menu.getMenuItemById('backdrop-' + view.backdrop); if (backdropItem) backdropItem.checked = true;
    const nextItem = menu.getMenuItemById('auto-advance'); if (nextItem) nextItem.checked = view.autoAdvance;
    const note = menu.getMenuItemById('transparency-note'); if (note) note.visible = nativeTheme.prefersReducedTransparency;
  }
}
function setMode(next) {
  if (fullscreen?.busy) return fullscreen.idle.then(()=>setMode(next));
  finishResize?.();
  if (next === 'expand') next = view.expandedMode;
  if (!Object.hasOwn(MODES, next)) throw new Error('Invalid window mode');
  if (mode === next) return viewState();
  if (win.isFullScreen()) {
    if (next === 'compact') return fullscreen.request(false).then(()=>setMode(next));
    mode = next; view.mode = next; view.expandedMode = next;
    saveView(); syncMenus(); broadcast('view:changed',viewState()); return viewState();
  }
  if (win.isMinimized()) win.restore();
  changingMode = true;
  clearTimeout(viewTimer);
  const previous = win.getBounds(); view.bounds[mode] = previous;
  if (mode !== 'compact') view.expandedMode = mode;
  const saved = view.bounds[next];
  const target = fitBounds({ x: previous.x, y: previous.y, width: saved?.width || MODES[next].width, height: saved?.height || MODES[next].height }, next);
  mode = next; view.mode = next;
  if (next !== 'compact') view.expandedMode = next;
  const animate = !reduceMotion() && win.isVisible();
  syncMenus();
  if (!animate) {
    constraints(next); win.setBounds(target); changingMode = false;
    saveView(); broadcast('view:changed', { ...viewState(), animate: false }); return viewState();
  }
  // Relax constraints only during the short fold, then restore exact mode limits.
  win.setMinimumSize(1, 1); win.setMaximumSize(1100, 950);
  win.setWindowButtonVisibility(next !== 'compact');
  broadcast('view:changed', { ...viewState(), animate: true });
  return new Promise(resolve => {
    finishResize = animateBounds(previous, target, {
      apply: bounds => { if (!win.isDestroyed()) win.setBounds(bounds); },
      reduced: () => reduceMotion() || !win.isVisible() || win.isMinimized(),
      done: () => {
        finishResize = null; changingMode = false; constraints(next);
        saveView(); syncMenus(); broadcast('view:changed', { ...viewState(), animate: false }); resolve(viewState());
      },
    });
  });
}
function priorityState(scope, requestedDay = null) {
  const todayKey = dayKey();
  const key = requestedDay || (scope === 'month' ? dayKey().slice(0, 7) + '-01' : scope === 'week' ? weekKey() : todayKey);
  return {scope,key,todayKey,rows:store.read(key,scope),...store.readProgress(key,scope),canUndoToday:scope==='day' && store.canUndoToday(key),pin:view.pin,skin,...viewState()};
}
function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!changingMode && !win.isFullScreen() && !fullscreen?.busy) win.setBounds(fitBounds(win.getNormalBounds(), mode));
  if (process.env.THREE_THINGS_TEST_DATA) win.showInactive(); else { win.show(); win.focus(); }
}
function effectiveBackdrop() { return 'opaque'; }
function applyBackdrop() {
  // Reconfiguring native vibrancy during a Space transition can exit full screen.
  // Every approved background is opaque; no visual-effect reconfiguration is needed.
  win.setBackgroundColor(skins[skin].background);
}
function setPreferences(delta) {
  const keys = Object.keys(delta || {});
  if (!keys.length || keys.some(k => !['pin','backdrop','autoAdvance'].includes(k)) ||
      ('pin' in delta && typeof delta.pin !== 'boolean') ||
      ('autoAdvance' in delta && typeof delta.autoAdvance !== 'boolean') ||
      ('backdrop' in delta && delta.backdrop !== 'opaque')) throw new Error('Invalid settings');
  finishResize?.();
  const next = { ...view, ...delta, mode, bounds: { ...view.bounds, [mode]: win.getNormalBounds() } };
  try { writeView(viewFile, next); }
  catch { syncMenus(); broadcast('view:notice', 'Could not save settings. The previous settings are still active. Try again.'); return {ok:false,...viewState()}; }
  view = next; win.setAlwaysOnTop(view.pin); applyBackdrop(); syncMenus(); broadcast('view:changed', {...viewState(),settingsSaved:true});
  return {ok:true,...viewState()};
}
function setPin(value) { setPreferences({pin:!!value}); }
function settingItems() {
  return [
    { id:'pin', label:'Always on Top', type:'checkbox', checked:view.pin, click:item=>setPin(item.checked) },
    { label:'Background', submenu:skinItems() },
    {type:'separator'},
    {label:'Export Priorities…',click:()=>broadcast('export:requested')},
  ];
}
function showSettings() { showWindow(); syncMenus(); broadcast('view:paused'); settingsMenu.popup({window:win}); }

function setSkin(name) {
  if (!Object.hasOwn(skins, name)) return;
  try {
    fs.writeFileSync(skinFile + '.tmp', JSON.stringify({ skin: name }), { mode: 0o600 });
    fs.renameSync(skinFile + '.tmp', skinFile); skin = name;
    applyBackdrop(); broadcast('appearance:changed', skin);
  } catch {
    void dialog.showMessageBox(win, { type: 'error', message: 'Could not save the appearance.', detail: 'Your priorities have not changed. Please try choosing the skin again.', buttons: ['OK'] });
  }
  syncMenus();
}
function modeItems() { return ['list', 'focus', 'compact'].map(name => ({ id: 'mode-' + name, label: name[0].toUpperCase() + name.slice(1), type: 'radio', checked: mode === name, click: () => { setMode(name); showWindow(); } })); }
function skinItems() { const items = kind => Object.entries(skins).filter(([,info]) => info.kind === kind).map(([name,info]) => ({id:'skin-'+name,label:info.label,type:'radio',checked:skin===name,click:()=>setSkin(name)})); return [{label:'Colors',enabled:false},...items('color'),{label:'Textures',enabled:false},...items('material'),{label:'Photographs',enabled:false},...items('photo'),{label:'Illustration',enabled:false},...items('illustration')]; }
function requestPeriod(scope) { showWindow(); broadcast('period:requested', scope); }
function createMenus() {
  settingsMenu = Menu.buildFromTemplate(settingItems());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Three Things', submenu: [{ role: 'about' }, {label:'Settings…',id:'settings',accelerator:'CmdOrCtrl+,',click:showSettings}, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [{ id: 'export', label: 'Export Priorities…', accelerator: 'CmdOrCtrl+Shift+E', click: () => broadcast('export:requested') }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [...modeItems(), {id:'fullscreen',label:'Enter Full Screen',accelerator:'Control+Command+F',click:()=>{finishResize?.();void fullscreen.request(!win.isFullScreen()).catch(error=>broadcast('view:notice',error.message));}}, { type: 'separator' }, { label: 'Today', accelerator: 'CmdOrCtrl+1', click: () => requestPeriod('day') }, { label: 'This Week', accelerator: 'CmdOrCtrl+2', click: () => requestPeriod('week') }, { label: 'This Month', accelerator: 'CmdOrCtrl+3', click: () => requestPeriod('month') } ] },
    { label: 'Background', submenu: skinItems() },
    { label: 'Window', submenu: [{ role: 'minimize', id: 'minimize', accelerator: 'CmdOrCtrl+M' }, { label: 'Show Three Things', id: 'show', click: showWindow }, { label: 'Keep on Top', type: 'checkbox', id: 'pin', checked: view.pin, click: item => setPin(item.checked) }, { type: 'separator' }, { role: 'front' }] },
  ]));
  trayMenu = Menu.buildFromTemplate([
    { label: 'Show Three Things', id: 'show', click: showWindow }, { type: 'separator' }, ...modeItems(),
    { type: 'separator' }, { label: 'Today', id: 'tray-day', click: () => requestPeriod('day') }, { label: 'This Week', id: 'tray-week', click: () => requestPeriod('week') }, { label: 'This Month', id: 'tray-month', click: () => requestPeriod('month') },
    { label: 'Settings', submenu: settingItems() }, { type: 'separator' }, { role: 'quit', label: 'Quit Three Things' },
  ]);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    if (process.env.THREE_THINGS_TEST_DATA) app.setActivationPolicy('accessory');
    try { store = new Store(path.join(app.getPath('userData'), 'priorities.json')); }
    catch (error) { dialog.showErrorBox('Your original data has not been changed', error.message); app.quit(); return; }
    skinFile = path.join(app.getPath('userData'), 'appearance.json');
    viewFile = path.join(app.getPath('userData'), 'view.json');
    view = readView(viewFile); mode = view.mode;
    try { const saved = JSON.parse(fs.readFileSync(skinFile, 'utf8')); const migrated = ({porcelain:'linen',paper:'linen',plum:'plum',oxblood:'graphite',moss:'graphite',clay:'clay',dusk:'graphite',cobalt:'graphite',ink:'graphite',butter:'linen',matcha:'linen',persimmon:'graphite',courtyard:'sunroom',redwoods:'alpine',coast:'horizon','olive-grove':'mist',stillwater:'mist',moonrise:'mist',atelier:'linen'})[saved.skin] || saved.skin; if (Object.hasOwn(skins, saved.skin)) skin = saved.skin; else if (Object.hasOwn(skins, migrated)) skin = migrated; } catch { /* Keep the default skin. */ }
    createMenus();
    const bounds = fitBounds(view.bounds[mode], mode);
    win = new BrowserWindow({ ...bounds, show: false, title: 'Three Things',
      titleBarStyle: 'hidden', trafficLightPosition: { x: 18, y: 16 }, backgroundColor: skins[skin].background,
      fullscreenable: true, resizable: true, alwaysOnTop: view.pin, visualEffectState: 'active',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !process.env.THREE_THINGS_TEST_DATA },
    });
    fullscreen = createFullscreen(win, {
      canEnter:()=>mode!=='compact',
      changed:()=>{ if(win.isFullScreen()) finishResize?.(); syncMenus(); saveView(); broadcast('view:changed',viewState()); },
      restoreBounds:bounds=>{ constraints(mode); win.setBounds(fitBounds(bounds,mode)); },
    });
    applyBackdrop();
    nativeTheme.on('updated', () => { if (!win.isDestroyed()) { applyBackdrop(); syncMenus(); broadcast('view:changed', viewState()); } });
    constraints(mode);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    const valid = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
    ipcMain.handle('priorities:load', (event, scope = 'day', requestedDay = null) => {
      if (!valid(event) || !['day', 'week', 'month'].includes(scope) || (requestedDay !== null && (scope !== 'day' || typeof requestedDay !== 'string' || !requestedDay))) throw new Error('Not allowed');
      return priorityState(scope, requestedDay);
    });
    for (const action of ['clear','undo']) ipcMain.handle('today:'+action, (event,key) => {
      if (!valid(event)) throw new Error('Not allowed');
      if (key !== dayKey()) return {ok:false,error:'The day changed. Switch periods and try again.'};
      try {
        if (action === 'clear') store.clearToday(key); else store.undoClearToday(key);
        return {ok:true,state:priorityState('day')};
      } catch {
        return {ok:false,error:action==='clear' ? 'Could not clear today. Your tasks are still here. Try again.' : 'Could not undo. Your cleared tasks are still recoverable. Try again.'};
      }
    });
    ipcMain.handle('priorities:save', (event, payload) => {
      if (!valid(event)) throw new Error('Not allowed');
      try {
        const before = store.readProgress(payload.key,payload.scope);
        store.save(payload.key, payload.rows, payload.scope, payload.extras);
        const progress = store.readProgress(payload.key,payload.scope);
        return { ok:true, ...progress, canUndoToday:payload.scope==='day' && store.canUndoToday(payload.key), allComplete:payload.rows.every(row=>row.done), justCompleted:!before.completedOnce && progress.completedOnce };
      }
      catch { return { ok: false, error: 'Could not save. Your changes are still here. Try again.' }; }
    });
    ipcMain.handle('window:reduced-motion', (event, value) => { if (!valid(event) || typeof value !== 'boolean') throw new Error('Not allowed'); rendererReduced = value; if (reduceMotion()) finishResize?.(); return rendererReduced; });
    ipcMain.handle('priorities:export', async event => {
      if (!valid(event) || exporting) return { cancelled: true };
      exporting = true;
      try {
        const result = await dialog.showSaveDialog(win, { title: 'Export Priorities', defaultPath: path.join(app.getPath('documents'), `ThreeThings-${dayKey()}.txt`), filters: [{ name: 'Plain text', extensions: ['txt'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] });
        if (result.canceled || !result.filePath) return { cancelled: true };
        writeTextExport(result.filePath, formatArchive(store.data)); return { ok: true };
      } catch { return { ok: false, error: 'Could not export. Your priorities are still saved on this Mac. Try File → Export Priorities again.' }; }
      finally { exporting = false; }
    });
    ipcMain.handle('window:settings', event => { if (!valid(event)) throw new Error('Not allowed'); showSettings(); });
    ipcMain.handle('window:preferences', (event,delta) => { if (!valid(event)) throw new Error('Not allowed'); return setPreferences(delta); });
    ipcMain.handle('window:fullscreen',async(event,value)=>{if(!valid(event))throw new Error('Not allowed');finishResize?.();await fullscreen.request(value);return viewState();});
    ipcMain.handle('window:mode', (event, next) => { if (!valid(event)) throw new Error('Not allowed'); return setMode(next); });
    ipcMain.handle('window:pin', (event, value) => { if (!valid(event) || typeof value !== 'boolean') throw new Error('Not allowed'); setPin(value); return view.pin; });
    const image = nativeImage.createFromPath(path.join(__dirname, '../assets/MenuTemplate.png'));
    image.setTemplateImage(true);
    try {
      tray = new Tray(image, '62475039-9029-5337-8f9f-6afd98fcff25');
      tray.setToolTip('Three Things — click to show; right-click for options');
      tray.on('click', showWindow);
      tray.on('right-click', () => { syncMenus(); broadcast('view:paused'); tray.popUpContextMenu(trayMenu); });
    } catch {
      win.webContents.once('did-finish-load', () => broadcast('view:notice', 'The menu-bar icon could not open. You can still use the Dock icon.'));
    }
    win.loadFile(path.join(__dirname, 'index.html'));
    win.once('ready-to-show', () => process.env.THREE_THINGS_TEST_DATA ? win.showInactive() : win.show());
    win.on('hide', () => { finishResize?.(); broadcast('view:paused'); }); win.on('minimize', () => { finishResize?.(); broadcast('view:paused'); });
    win.on('move', queueViewSave); win.on('resize', queueViewSave);
    win.on('close', event => { finishResize?.(); saveView(); if (!quitting) { event.preventDefault(); win.hide(); } });
    screen.on('display-removed', showWindow);
    screen.on('display-metrics-changed', () => { if (win && !win.isDestroyed() && !win.isFullScreen() && !fullscreen?.busy) win.setBounds(fitBounds(win.getNormalBounds(), mode)); });
  });
  app.on('activate', showWindow);
  app.on('before-quit', () => { finishResize?.(); saveView(); quitting = true; });
  app.on('will-quit', () => { clearTimeout(viewTimer); tray?.destroy(); });
}
// Main-process diagnostics only; never exposed through the renderer bridge.
module.exports = { getRuntime: () => ({ win, tray, trayMenu, settingsMenu, mode, view, effectiveBackdrop: effectiveBackdrop() }) };
