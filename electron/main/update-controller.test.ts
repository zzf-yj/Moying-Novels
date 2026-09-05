import { beforeEach, describe, expect, it, vi } from 'vitest'

const updater = vi.hoisted(() => ({
  autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
  on: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn()
}))
vi.mock('electron-updater', () => ({ autoUpdater: updater }))
import { newerStableVersion, UpdateController, updateErrorMessage } from './update-controller'

function emit(event: string, payload?: unknown): void {
  const registration = updater.on.mock.calls.find(([name]) => name === event)
  if (!registration) throw new Error(`Missing listener: ${event}`)
  registration[1](payload)
}

beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllGlobals()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API unavailable')))
})

describe('update controller', () => {
  it('normalizes Windows HTML notes before sending them to the renderer', () => {
    const controller = new UpdateController(true, 'win32', '0.2.1', vi.fn())
    emit('update-available', { version: '0.2.2', releaseNotes: '<h2>更新内容</h2><ul><li>正文拖动</li></ul>' })
    expect(controller.snapshot().notes).toBe('更新内容\n\n• 正文拖动')
    emit('update-available', { version: '0.2.2', releaseNotes: [{ note: '<p>第一项</p>' }, { note: '<p>第二项</p>' }] })
    expect(controller.snapshot().notes).toBe('第一项\n\n第二项')
  })
  it('normalizes macOS Markdown notes without exposing formatting markers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.2.2', body: '## 更新内容\n\n- **正文拖动**' }) }))
    const controller = new UpdateController(true, 'darwin', '0.2.1', vi.fn())
    expect((await controller.check()).notes).toBe('更新内容\n\n• 正文拖动')
  })
  it('reports current Windows version without requiring download metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.2.1' }) }))
    const controller = new UpdateController(true, 'win32', '0.2.1', vi.fn())
    expect(await controller.check()).toMatchObject({ status: 'current', message: '当前已是最新版本，无需更新。' })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })
  it('does not call an older Windows installation current when metadata is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.2.1' }) }))
    const controller = new UpdateController(true, 'win32', '0.2.0', vi.fn())
    updater.checkForUpdates.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' }))
    expect(await controller.check()).toMatchObject({ status: 'error', message: expect.stringContaining('latest.yml') })
  })
  it('does not disguise ordinary network failures as already up to date', async () => {
    const controller = new UpdateController(true, 'win32', '0.2.1', vi.fn())
    updater.checkForUpdates.mockRejectedValue(new Error('offline'))
    expect((await controller.check()).status).toBe('error')
    expect(updateErrorMessage(new Error('offline'))).toContain('网络')
  })
  it('compares stable versions numerically and rejects prereleases', () => {
    expect(newerStableVersion('v0.10.0', '0.2.0')).toBe(true)
    expect(newerStableVersion('v0.2.0', '0.2.0')).toBe(false)
    expect(newerStableVersion('v0.1.9', '0.2.0')).toBe(false)
    expect(newerStableVersion('v0.3.0-beta.1', '0.2.0')).toBe(false)
  })
  it('does not check, download or install in development', async () => {
    const controller = new UpdateController(false, 'win32', '0.2.0', vi.fn())
    expect((await controller.check()).status).toBe('development')
    await controller.download()
    await controller.install(vi.fn())
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })
  it('requires explicit download and waits for persistence before installing', async () => {
    const controller = new UpdateController(true, 'win32', '0.2.0', vi.fn())
    updater.checkForUpdates.mockImplementation(async () => emit('update-available', { version: '0.2.1', releaseNotes: '修复问题' }))
    await controller.check()
    expect(controller.snapshot()).toMatchObject({ status: 'available', automatic: true, version: '0.2.1' })
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    await controller.download()
    emit('download-progress', { percent: 42.3 })
    expect(controller.snapshot().percent).toBe(42)
    emit('update-downloaded')
    let finish: () => void = () => {}
    const prepare = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const installing = controller.install(prepare)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    finish()
    await installing
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
  it('coalesces repeated checks and prevents premature installation', async () => {
    const controller = new UpdateController(true, 'win32', '0.2.0', vi.fn())
    let finish: () => void = () => {}
    updater.checkForUpdates.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    const first = controller.check()
    await controller.check()
    await controller.install(vi.fn())
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    emit('update-not-available')
    finish()
    await first
    expect(controller.snapshot().status).toBe('current')
  })
  it('reports failed downloads and permits checking again', async () => {
    const controller = new UpdateController(true, 'win32', '0.2.0', vi.fn())
    emit('update-available', { version: '0.2.1' })
    updater.downloadUpdate.mockRejectedValue(new Error('offline'))
    await controller.download()
    expect(controller.snapshot().status).toBe('error')
    updater.checkForUpdates.mockImplementation(async () => emit('update-available', { version: '0.2.1' }))
    await controller.check()
    expect(controller.snapshot().status).toBe('available')
  })
  it('does not install when saving progress fails', async () => {
    const controller = new UpdateController(true, 'win32', '0.2.0', vi.fn())
    emit('update-downloaded')
    await controller.install(async () => { throw new Error('disk full') })
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    expect(controller.snapshot().status).toBe('error')
  })
  it('uses GitHub version metadata on macOS without invoking the native installer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.2.1', body: '更新说明' }) })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new UpdateController(true, 'darwin', '0.2.0', vi.fn())
    expect(await controller.check()).toMatchObject({ status: 'available', automatic: false, version: '0.2.1' })
    await controller.download()
    await controller.install(vi.fn())
    expect(updater.on).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })
  it('handles missing releases and API failures', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ status: 403, ok: false })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new UpdateController(true, 'darwin', '0.2.0', vi.fn())
    expect((await controller.check()).status).toBe('current')
    expect((await controller.check()).status).toBe('error')
  })
})
