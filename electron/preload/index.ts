import { contextBridge, ipcRenderer } from 'electron'
import type { ReaderApi, ReaderSettings, ReadingProgress } from '../../shared/types'

const api: ReaderApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  importBooks: () => ipcRenderer.invoke('books:import'),
  openBook: (bookId) => ipcRenderer.invoke('books:open', bookId),
  removeBook: (bookId) => ipcRenderer.invoke('books:remove', bookId),
  saveProgress: (bookId: string, progress: ReadingProgress) => ipcRenderer.invoke('progress:save', bookId, progress),
  saveSettings: (settings: ReaderSettings) => ipcRenderer.invoke('settings:save', settings),
  setStealthEnabled: (enabled) => ipcRenderer.invoke('window:stealth', enabled),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:always-on-top', enabled),
  getWindowBounds: () => ipcRenderer.invoke('window:get-bounds'),
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
