import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../../shared/types'

export const releasesUrl = 'https://github.com/zzf-yj/Moying-Novels/releases/latest'
const latestApi = 'https://api.github.com/repos/zzf-yj/Moying-Novels/releases/latest'

export function newerStableVersion(tag: string, current: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!match) return false
  const next = match.slice(1).map(Number)
  const previous = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (next[i] !== previous[i]) return next[i] > previous[i]
  }
  return false
}

export class UpdateController {
  private state: UpdateState
  constructor(private readonly packaged: boolean, private readonly platform: string, private readonly currentVersion: string, private readonly notify: (state: UpdateState) => void) {
    this.state = { status: 'idle', automatic: packaged && platform === 'win32' }
    if (!this.state.automatic) return
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false
    autoUpdater.on('error', (error) => this.fail(error))
    autoUpdater.on('update-available', (info) => this.set({ status: 'available', version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes?.map(note => note.note).join('\n') }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'current' }))
    autoUpdater.on('download-progress', (progress) => this.set({ ...this.state, status: 'downloading', percent: Math.min(100, Math.max(0, Math.round(progress.percent))) }))
    autoUpdater.on('update-downloaded', () => this.set({ ...this.state, status: 'downloaded', percent: 100 }))
  }
  snapshot(): UpdateState { return { ...this.state } }
  private set(patch: Omit<UpdateState, 'automatic'>): void {
    this.state = { ...patch, automatic: this.packaged && this.platform === 'win32' }
    this.notify(this.snapshot())
  }
  private fail(error: unknown): void {
    console.error('[update-failed]', error)
    this.set({ status: 'error', message: '更新失败，请检查网络后重试，或前往发布页下载。' })
  }
  async check(): Promise<UpdateState> {
    if (['checking', 'downloading', 'downloaded', 'installing'].includes(this.state.status)) return this.snapshot()
    if (!this.packaged) {
      this.set({ status: 'development', message: '开发模式不下载或安装更新，请在安装版中检查更新。' })
      return this.snapshot()
    }
    this.set({ status: 'checking' })
    try {
      if (this.state.automatic) {
        await autoUpdater.checkForUpdates()
      } else {
        const response = await fetch(latestApi, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) })
        if (response.status === 404) {
          this.set({ status: 'current', message: '暂未发布正式版本。' })
        } else {
          if (!response.ok) throw new Error(`GitHub: ${response.status}`)
          const release = await response.json() as { tag_name?: string; body?: string; draft?: boolean; prerelease?: boolean }
          if (release.draft || release.prerelease || typeof release.tag_name !== 'string') throw new Error('Invalid release')
          this.set(newerStableVersion(release.tag_name, this.currentVersion)
            ? { status: 'available', version: release.tag_name.replace(/^v/, ''), notes: typeof release.body === 'string' ? release.body : '' }
            : { status: 'current' })
        }
      }
    } catch (error) { this.fail(error) }
    return this.snapshot()
  }
  async download(): Promise<void> {
    if (!this.state.automatic || this.state.status !== 'available') return
    this.set({ ...this.state, status: 'downloading', percent: 0 })
    try { await autoUpdater.downloadUpdate() } catch (error) { this.fail(error) }
  }
  async install(prepare: () => Promise<void>): Promise<void> {
    if (!this.state.automatic || this.state.status !== 'downloaded') return
    this.set({ ...this.state, status: 'installing' })
    try {
      await prepare()
      autoUpdater.quitAndInstall(false, true)
    } catch (error) { this.fail(error) }
  }
}
