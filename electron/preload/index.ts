import { contextBridge, ipcRenderer } from 'electron'
import type { ReaderApi, ReaderSettings, ReadingProgress } from '../../shared/types'

const api: ReaderApi = {
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleases: () => ipcRenderer.invoke('update:releases'),
  onUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: import('../../shared/types').UpdateState): void => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  },
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openProjectPage: () => ipcRenderer.invoke('app:open-project'),
  getState: () => ipcRenderer.invoke('state:get'),
  importBooks: () => ipcRenderer.invoke('books:import'),
  openBook: (bookId) => ipcRenderer.invoke('books:open', bookId),
  removeBook: (bookId) => ipcRenderer.invoke('books:remove', bookId),
  saveProgress: (bookId: string, progress: ReadingProgress) => ipcRenderer.invoke('progress:save', bookId, progress),
  saveSettings: (settings: ReaderSettings) => ipcRenderer.invoke('settings:save', settings),
  setStealthEnabled: (enabled) => ipcRenderer.invoke('window:stealth', enabled),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:always-on-top', enabled),
  getWindowBounds: () => ipcRenderer.invoke('window:get-bounds'),
  startWindowDrag: () => ipcRenderer.send('window:drag-start'),
  moveWindowDrag: () => ipcRenderer.send('window:drag-move'),
  endWindowDrag: () => ipcRenderer.send('window:drag-end'),
  setWindowBounds: (bounds) => ipcRenderer.send('window:set-bounds', bounds),
  setWindowInteractionActive: (active) => ipcRenderer.send('window:interaction', active),
  pointerLeftWindow: () => ipcRenderer.send('window:pointer-left'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  onStealthVisibility: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, visible: boolean): void => callback(visible)
    ipcRenderer.on('stealth:visibility', listener)
    return () => ipcRenderer.removeListener('stealth:visibility', listener)
  }
}

contextBridge.exposeInMainWorld('reader', api)
