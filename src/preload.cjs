const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('threeThings', {
  load: scope => ipcRenderer.invoke('priorities:load', scope),
  export: () => ipcRenderer.invoke('priorities:export'),
  onExport: callback => ipcRenderer.on('export:requested', () => callback()),
  save: payload => ipcRenderer.invoke('priorities:save', payload),
  settings: () => ipcRenderer.invoke('window:settings'),
  preferences: value => ipcRenderer.invoke('window:preferences', value),
  onPause: callback => ipcRenderer.on('view:paused', () => callback()),
  pin: value => ipcRenderer.invoke('window:pin', value),
  mode: value => ipcRenderer.invoke('window:mode', value),
  motion: value => ipcRenderer.invoke('window:reduced-motion', value),
  onSkin: callback => ipcRenderer.on('appearance:changed', (_event, value) => callback(value)),
  onView: callback => ipcRenderer.on('view:changed', (_event, value) => callback(value)),
  onNotice: callback => ipcRenderer.on('view:notice', (_event, value) => callback(value)),
  onPeriod: callback => ipcRenderer.on('period:requested', (_event, value) => callback(value)),
});
