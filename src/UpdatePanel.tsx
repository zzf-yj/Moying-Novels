import { useEffect, useState } from 'react'
import type { UpdateState } from '../shared/types'

export function UpdatePanel({ currentVersion, close, beforeInstall }: { currentVersion: string; close: () => void; beforeInstall: () => Promise<void> }): React.JSX.Element {
  const [state, setState] = useState<UpdateState>({ status: 'idle', automatic: false })
  const [error, setError] = useState('')
  const run = (action: () => Promise<unknown>): void => { setError(''); void action().catch(() => setError('操作失败，请稍后重试。')) }
  useEffect(() => {
    let active = true
    let received = false
    const unsubscribe = window.reader.onUpdateState((next) => { received = true; if (active) setState(next) })
    void window.reader.getUpdateState().then(next => { if (active && !received) setState(next) }).catch(() => { if (active) setError('无法获取更新状态。') })
    return () => { active = false; unsubscribe() }
  }, [])
  const busy = ['checking', 'downloading', 'installing'].includes(state.status)
  const labels: Record<UpdateState['status'], string> = {
    idle: '检查是否有新版本', checking: '正在检查更新…', current: state.message ?? '当前已是最新版本，无需更新。', available: `发现新版本 ${state.version ?? ''}`,
    downloading: `正在下载 ${state.percent ?? 0}%`, downloaded: '下载完成，可重启安装', installing: '正在准备重启…', error: '更新失败', development: '开发模式'
  }
  return <div className="overlay" onClick={close}>
    <aside className="drawer update-drawer" role="dialog" aria-modal="true" aria-labelledby="update-title" onClick={event => event.stopPropagation()}>
      <div className="drawer-title"><h2 id="update-title">版本更新</h2><button aria-label="关闭更新面板" onClick={close}>×</button></div>
      <p>当前版本 v{currentVersion}</p>
      <p role="status" aria-live="polite">{labels[state.status]}</p>
      {state.message && state.status !== 'current' && <p className="settings-note">{state.message}</p>}
      {state.status === 'downloading' && <progress aria-label="更新下载进度" max={100} value={state.percent ?? 0} />}
      {error && <p role="alert">{error}</p>}
      <div className="update-actions">
        {state.status === 'available' && <button className="primary" onClick={() => run(state.automatic ? window.reader.downloadUpdate : window.reader.openReleases)}>{state.automatic ? '下载更新' : '前往下载新版'}</button>}
        {state.status === 'downloaded' && <button className="primary" onClick={() => run(async () => { await beforeInstall(); await window.reader.installUpdate() })}>重启并更新</button>}
        {!busy && state.status !== 'downloaded' && <button className="primary" onClick={() => run(window.reader.checkUpdate)}>检查更新</button>}
        <button className="update-link" onClick={() => run(window.reader.openReleases)}>GitHub 发布页 ↗</button>
      </div>
      {state.notes && <details className="update-notes" open>
        <summary>更新说明</summary>
        <div className="update-notes-body">{state.notes}</div>
      </details>}
      <p className="settings-note">Windows 安装版支持下载后重启更新；macOS 当前需下载新版并替换应用。关闭本面板不会中断下载。</p>
    </aside>
  </div>
}
