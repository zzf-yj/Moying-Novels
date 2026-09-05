export interface BookMeta {
  id: string
  title: string
  originalName: string
  encoding: string
  size: number
  addedAt: number
}

export interface Chapter {
  title: string
  content: string
}

export interface ReadingProgress {
  chapterIndex: number
  scrollTop: number
  updatedAt: number
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface ReaderSettings {
  fontSize: number
  lineHeight: number
  paragraphSpacing: number
  textColor: string
  backgroundColor: string
  backgroundOpacity: number
  textOpacity: number
  alwaysOnTop: boolean
  hideFromTaskbar: boolean
  autoScrollSpeed: number
  windowBounds: WindowBounds
}

export interface PersistedState {
  books: BookMeta[]
  progress: Record<string, ReadingProgress>
  settings: ReaderSettings
}

export interface OpenedBook {
  book: BookMeta
  chapters: Chapter[]
}

export interface AppInfo {
  version: string
  repositoryUrl: string
}

export interface ReaderApi {
  getUpdateState: () => Promise<UpdateState>
  checkUpdate: () => Promise<UpdateState>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  openReleases: () => Promise<void>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  getAppInfo: () => Promise<AppInfo>
  openProjectPage: () => Promise<void>
  getState: () => Promise<PersistedState>
  importBooks: () => Promise<BookMeta[]>
  openBook: (bookId: string) => Promise<OpenedBook>
  removeBook: (bookId: string) => Promise<void>
  saveProgress: (bookId: string, progress: ReadingProgress) => Promise<void>
  saveSettings: (settings: ReaderSettings) => Promise<void>
  setStealthEnabled: (enabled: boolean) => Promise<void>
  setAlwaysOnTop: (enabled: boolean) => Promise<void>
  getWindowBounds: () => Promise<Required<WindowBounds>>
  startWindowDrag: () => void
  moveWindowDrag: () => void
  endWindowDrag: () => void
  setWindowBounds: (bounds: Required<WindowBounds>) => void
  setWindowInteractionActive: (active: boolean) => void
  pointerLeftWindow: () => void
  minimize: () => void
  close: () => void
  onStealthVisibility: (callback: (visible: boolean) => void) => () => void
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'development'
  automatic: boolean
  version?: string
  notes?: string
  percent?: number
  message?: string
}
