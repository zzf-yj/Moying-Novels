import { app, autoUpdater as nativeUpdater, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import iconv from 'iconv-lite'
import { AppStore } from './store'
import { parseChapters } from './chapter-parser'
import { StealthController } from './stealth-controller'
import { UpdateController, releasesUrl } from './update-controller'
import type { BookMeta, ReaderSettings, ReadingProgress, WindowBounds } from '../../shared/types'

const legacyUserDataDirectory = app.getPath('userData')
const dedicatedUserDataDirectory = path.join(app.getPath('appData'), '墨隐阅读')
const maximumBookBytes = 30 * 1024 * 1024
const maximumStoredBookBytes = 60 * 1024 * 1024
const projectUrl = 'https://github.com/zzf-yj/Moying-Novels'
app.setName('墨隐阅读')
app.setPath('userData', dedicatedUserDataDirectory)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let flushingBeforeQuit = false
let boundsTimer: NodeJS.Timeout | undefined
const store = new AppStore()
const stealth = new StealthController(() => mainWindow)

function applyTaskbarVisibility(): void {
  const hidden = stealth.isEnabled() || store.snapshot().settings.hideFromTaskbar
  mainWindow?.setSkipTaskbar(hidden)
  if (process.platform === 'darwin') {
    if (hidden) app.dock?.hide()
    else app.dock?.show()
  }
}

async function migrateLegacyData(): Promise<void> {
  if (legacyUserDataDirectory === dedicatedUserDataDirectory) return
  const targetState = path.join(dedicatedUserDataDirectory, 'state.json')
  const legacyState = path.join(legacyUserDataDirectory, 'state.json')
  try {
    await fs.access(targetState)
    return
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error
  }
  try {
    await fs.access(legacyState)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return
    throw error
  }

  const temporaryState = `${targetState}.migrating`
  await fs.mkdir(path.join(dedicatedUserDataDirectory, 'books'), { recursive: true })
  try {
    await fs.cp(path.join(legacyUserDataDirectory, 'books'), path.join(dedicatedUserDataDirectory, 'books'), { recursive: true })
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error
  }
  await fs.copyFile(legacyState, temporaryState)
  await fs.rename(temporaryState, targetState)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function safeWindowBounds(saved: WindowBounds): Required<WindowBounds> {
  const primaryArea = screen.getPrimaryDisplay().workArea
  const width = Math.min(Math.max(240, saved.width), primaryArea.width)
  const height = Math.min(Math.max(180, saved.height), primaryArea.height)
  const x = saved.x
  const y = saved.y
  const hasVisibleArea = typeof x === 'number' && typeof y === 'number' && screen.getAllDisplays().some(({ workArea }) => (
    Math.min(x + width, workArea.x + workArea.width) - Math.max(x, workArea.x) >= 64 &&
    Math.min(y + height, workArea.y + workArea.height) - Math.max(y, workArea.y) >= 64
  ))
  if (hasVisibleArea && typeof x === 'number' && typeof y === 'number') return { x, y, width, height }
  return {
    x: primaryArea.x + Math.round((primaryArea.width - width) / 2),
    y: primaryArea.y + Math.round((primaryArea.height - height) / 2),
    width,
    height
  }
}

function decodeText(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'UTF-8 BOM' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: iconv.decode(buffer.subarray(2), 'utf16-le'), encoding: 'UTF-16 LE' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' }
  } catch {
    return { text: iconv.decode(buffer, 'gb18030'), encoding: 'GB18030' }
  }
}

function createTray(): void {
  const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="#263238"/><path d="M8 8h16v16H8z" fill="none" stroke="white" stroke-width="2"/><path d="M12 12h8M12 16h8M12 20h5" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>')
  const image = nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`).resize({ width: 16, height: 16 })
  if (process.platform === 'darwin') image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('墨隐阅读')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示/隐藏阅读器', click: () => stealth.toggleWindowVisibility() },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } }
  ]))
  tray.on('click', () => stealth.toggleWindowVisibility())
}

function createWindow(): void {
  const savedSettings = store.snapshot().settings
  const saved = safeWindowBounds(savedSettings.windowBounds)
  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 240,
    minHeight: 180,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: savedSettings.hideFromTaskbar,
    alwaysOnTop: savedSettings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  mainWindow.setMenu(null)
  if (process.platform === 'darwin') {
    mainWindow.setHiddenInMissionControl(true)
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  applyTaskbarVisibility()

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.setOpacity(1)
    mainWindow?.show()
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[renderer-load-failed]', { code, description, url })
  })
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      stealth.hideToTray()
    }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  const saveBounds = (): void => {
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
      void store.saveBounds(mainWindow.getBounds())
    }, 300)
  }
  mainWindow.on('move', saveBounds)
  mainWindow.on('resize', saveBounds)
  mainWindow.on('will-move', () => stealth.setInteractionActive(true))
  mainWindow.on('moved', () => stealth.setInteractionActive(false))
  mainWindow.on('will-resize', () => stealth.setInteractionActive(true))
  mainWindow.on('resized', () => stealth.setInteractionActive(false))

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  const updates = new UpdateController(app.isPackaged, process.platform, app.getVersion(), (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:state', state)
  })
  ipcMain.handle('update:state', () => updates.snapshot())
  ipcMain.handle('update:check', () => updates.check())
  ipcMain.handle('update:download', () => updates.download())
  ipcMain.handle('update:releases', () => shell.openExternal(releasesUrl))
  ipcMain.handle('update:install', () => updates.install(async () => {
    clearTimeout(boundsTimer)
    if (mainWindow && !mainWindow.isDestroyed()) await store.saveBounds(mainWindow.getNormalBounds())
    await store.flush()
  }))
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), repositoryUrl: projectUrl }))
  ipcMain.handle('app:open-project', () => shell.openExternal(projectUrl))
  ipcMain.handle('state:get', () => store.snapshot())

  ipcMain.handle('books:import', async (): Promise<BookMeta[]> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入 TXT 小说',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'TXT 小说', extensions: ['txt'] }]
    })
    if (result.canceled) return []

    const imported: BookMeta[] = []
    const createdPaths: string[] = []
    try {
      for (const sourcePath of result.filePaths) {
        const file = await fs.stat(sourcePath)
        if (file.size > maximumBookBytes) throw new Error(`《${path.basename(sourcePath)}》超过 30 MB，暂不支持导入。`)
        const buffer = await fs.readFile(sourcePath)
        const decoded = decodeText(buffer)
        const id = randomUUID()
        const destination = path.join(store.booksDirectory, `${id}.txt`)
        await fs.writeFile(destination, decoded.text, 'utf8')
        createdPaths.push(destination)
        const name = path.basename(sourcePath, path.extname(sourcePath))
        imported.push({
          id,
          title: name,
          originalName: path.basename(sourcePath),
          encoding: decoded.encoding,
          size: buffer.byteLength,
          addedAt: Date.now()
        })
      }
      await store.update((state) => state.books.unshift(...imported))
    } catch (error) {
      await Promise.all(createdPaths.map((createdPath) => fs.rm(createdPath, { force: true })))
      throw error
    }
    return imported
  })

  ipcMain.handle('books:open', async (_event, bookId: string) => {
    const book = store.snapshot().books.find((item) => item.id === bookId)
    if (!book) throw new Error('找不到这本书，可能已经被删除。')
    const bookPath = path.join(store.booksDirectory, `${book.id}.txt`)
    if (book.size > maximumBookBytes || (await fs.stat(bookPath)).size > maximumStoredBookBytes) {
      throw new Error('这本小说超过 30 MB，无法安全加载。')
    }
    const content = await fs.readFile(bookPath, 'utf8')
    return { book, chapters: parseChapters(content) }
  })

  ipcMain.handle('books:remove', async (_event, bookId: string) => {
    await store.update((state) => {
      state.books = state.books.filter((book) => book.id !== bookId)
      delete state.progress[bookId]
    })
    await fs.rm(path.join(store.booksDirectory, `${bookId}.txt`), { force: true })
  })

  ipcMain.handle('progress:save', (_event, bookId: string, progress: ReadingProgress) => {
    return store.saveProgress(bookId, progress)
  })

  ipcMain.handle('settings:save', async (_event, settings: ReaderSettings): Promise<void> => {
    await store.saveSettings(settings)
    mainWindow?.setAlwaysOnTop(settings.alwaysOnTop)
    applyTaskbarVisibility()
  })

  ipcMain.handle('window:stealth', (_event, enabled: boolean) => {
    stealth.setEnabled(enabled)
    applyTaskbarVisibility()
  })
  ipcMain.handle('window:always-on-top', (_event, enabled: boolean) => mainWindow?.setAlwaysOnTop(enabled))
  ipcMain.handle('window:get-bounds', () => mainWindow?.getBounds())
  ipcMain.on('window:set-bounds', (_event, bounds: Electron.Rectangle) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(240, Math.round(bounds.width)),
      height: Math.max(180, Math.round(bounds.height))
    }, false)
  })
  ipcMain.on('window:interaction', (_event, active: boolean) => stealth.setInteractionActive(active))
  ipcMain.on('window:pointer-left', () => stealth.pointerLeft())
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:close', () => stealth.hideToTray())
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    stealth.reveal()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady()
    .then(async () => {
      await migrateLegacyData()
      await store.initialize()
      registerIpc()
      createWindow()
      createTray()
    })
    .catch((error) => {
      console.error('[application-start-failed]', error)
      app.quit()
    })
}

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  else {
    stealth.reveal()
    mainWindow.show()
  }
})

nativeUpdater.on('before-quit-for-update', () => {
  // Set only after the installer starts successfully. Failed installs leave normal quitting intact.
  quitting = true
  flushingBeforeQuit = true
  stealth.destroy()
})

app.on('before-quit', (event) => {
  quitting = true
  stealth.destroy()
  if (flushingBeforeQuit) return
  event.preventDefault()
  flushingBeforeQuit = true
  clearTimeout(boundsTimer)
  const saveFinalBounds = mainWindow && !mainWindow.isDestroyed()
    ? store.saveBounds(mainWindow.getNormalBounds())
    : Promise.resolve()
  void saveFinalBounds
    .then(() => store.flush())
    .catch((error) => console.error('[state-flush-failed]', error))
    .finally(() => app.quit())
})

app.on('window-all-closed', () => {
  // Keep the tray/menu-bar process alive on both desktop platforms.
})
