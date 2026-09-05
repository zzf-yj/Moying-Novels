import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PersistedState, ReaderSettings, ReadingProgress, WindowBounds } from '../../shared/types'
import { defaultSettings } from './defaults'
import { normalizePersistedState } from './state-validation'

const emptyState = (): PersistedState => ({
  books: [],
  progress: {},
  settings: structuredClone(defaultSettings)
})

export class AppStore {
  private state: PersistedState = emptyState()
  private writeQueue: Promise<void> = Promise.resolve()
  private readonly dataDirectory = app.getPath('userData')
  private readonly statePath = path.join(this.dataDirectory, 'state.json')
  readonly booksDirectory = path.join(this.dataDirectory, 'books')

  async initialize(): Promise<void> {
    await fs.mkdir(this.booksDirectory, { recursive: true })
    try {
      this.state = normalizePersistedState(JSON.parse(await fs.readFile(this.statePath, 'utf8')), defaultSettings)
    } catch (error) {
      if (!(error instanceof SyntaxError) && (!isNodeError(error) || error.code !== 'ENOENT')) throw error
      if (error instanceof SyntaxError) {
        const backupPath = path.join(this.dataDirectory, `state.corrupt-${Date.now()}.json`)
        await fs.copyFile(this.statePath, backupPath)
      }
      this.state = emptyState()
      await this.persist()
    }
  }

  snapshot(): PersistedState {
    return structuredClone(this.state)
  }

  async update(mutator: (state: PersistedState) => void): Promise<void> {
    mutator(this.state)
    this.state = normalizePersistedState(this.state, defaultSettings)
    await this.persist()
  }

  async saveProgress(bookId: string, progress: ReadingProgress): Promise<void> {
    await this.update((state) => {
      state.progress[bookId] = progress
    })
  }

  async saveSettings(settings: ReaderSettings): Promise<void> {
    await this.update((state) => {
      state.settings = settings
    })
  }

  async saveBounds(bounds: WindowBounds): Promise<void> {
    await this.update((state) => {
      state.settings.windowBounds = bounds
    })
  }

  async flush(): Promise<void> {
    await this.writeQueue
  }

  private persist(): Promise<void> {
    const serialized = JSON.stringify(this.state, null, 2)
    const write = async (): Promise<void> => {
      const temporaryPath = `${this.statePath}.tmp`
      await fs.writeFile(temporaryPath, serialized, 'utf8')
      await fs.rename(temporaryPath, this.statePath)
    }
    const pending = this.writeQueue.then(write, write)
    this.writeQueue = pending.catch(() => undefined)
    return pending
  }
}

export { defaultSettings } from './defaults'

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
