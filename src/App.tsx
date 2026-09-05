import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { UpdatePanel } from './UpdatePanel'
import { atChapterEnd, ChapterAdvanceGate, endScreenReadingTime } from './chapter-navigation'
import { useWindowDrag } from './use-window-drag'
import type { AppInfo, BookMeta, OpenedBook, PersistedState, ReaderSettings, ReadingProgress, WindowBounds } from '../shared/types'

const formatSize = (size: number): string => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / 1024 / 1024).toFixed(1)} MB`

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type ToolbarMode = 'full' | 'compact' | 'narrow'

function ResizeHandles(): React.JSX.Element {
  const beginResize = async (event: React.PointerEvent<HTMLDivElement>, edge: ResizeEdge): Promise<void> => {
    event.preventDefault()
    window.reader.setWindowInteractionActive(true)
    const target = event.currentTarget
    const pointerId = event.pointerId
    const startX = event.screenX
    const startY = event.screenY
    let initial: Required<WindowBounds> | undefined
    let stopped = false
    const move = (moveEvent: PointerEvent): void => {
      if (!initial || moveEvent.pointerId !== pointerId) return
      const dx = moveEvent.screenX - startX
      const dy = moveEvent.screenY - startY
      const right = initial.x + initial.width
      const bottom = initial.y + initial.height
      let { x, y, width, height } = initial

      if (edge.includes('e')) width = Math.max(240, initial.width + dx)
      if (edge.includes('s')) height = Math.max(180, initial.height + dy)
      if (edge.includes('w')) {
        width = Math.max(240, initial.width - dx)
        x = right - width
      }
      if (edge.includes('n')) {
        height = Math.max(180, initial.height - dy)
        y = bottom - height
      }
      window.reader.setWindowBounds({ x, y, width, height })
    }
    const stop = (stopEvent?: PointerEvent): void => {
      if (stopped || (stopEvent && stopEvent.pointerId !== pointerId)) return
      stopped = true
      window.reader.setWindowInteractionActive(false)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
      target.removeEventListener('pointercancel', stop)
      target.removeEventListener('lostpointercapture', stop)
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
    target.addEventListener('lostpointercapture', stop)
    target.setPointerCapture(pointerId)
    try {
      initial = await window.reader.getWindowBounds()
    } catch (error) {
      console.error('[window-bounds-read-failed]', error)
      stop()
    }
  }

  return <>{(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeEdge[]).map((edge) => (
    <div className={`resize-handle resize-${edge}`} key={edge} onPointerDown={(event) => void beginResize(event, edge)} />
  ))}</>
}

function App(): React.JSX.Element {
  const [state, setState] = useState<PersistedState | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [opened, setOpened] = useState<OpenedBook | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [stealth, setStealth] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>('full')
  const [notice, setNotice] = useState('')
  const readerRef = useRef<HTMLDivElement>(null)
  const readerShellRef = useRef<HTMLElement>(null)
  const fullToolbarMeasureRef = useRef<HTMLDivElement>(null)
  const compactToolbarMeasureRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const pendingProgress = useRef<{ bookId: string; progress: ReadingProgress } | null>(null)
  const lastProgressSaveAt = useRef(0)
  const openRequest = useRef(0)
  const chapterAdvance = useRef(new ChapterAdvanceGate())
  const chapterScrollTarget = useRef<number | null>(null)
  const windowDrag = useWindowDrag(opened?.book.id ?? null)

  useEffect(() => {
    window.reader.getState().then(setState).catch((error) => {
      console.error('[state-initialization-failed]', error)
      setNotice(String(error))
    })
    window.reader.getAppInfo().then(setAppInfo).catch((error) => {
      console.error('[app-info-read-failed]', error)
    })
  }, [])

  const setChapter = useCallback((next: number): void => {
    if (!opened) return
    const bounded = Math.max(0, Math.min(next, opened.chapters.length - 1))
    if (bounded === chapterIndex) {
      readerRef.current?.scrollTo({ top: 0 })
      return
    }
    chapterScrollTarget.current = 0
    setChapterIndex(bounded)
  }, [opened, chapterIndex])

  useLayoutEffect(() => {
    if (readerRef.current && chapterScrollTarget.current !== null) {
      readerRef.current.scrollTop = chapterScrollTarget.current
      chapterScrollTarget.current = null
    }
  }, [opened, chapterIndex])

  const advanceFromEnd = useCallback((): boolean => {
    const element = readerRef.current
    if (!opened || !element || settingsOpen || chaptersOpen || windowDrag.dragging) return false
    if (!chapterAdvance.current.advance(element, chapterIndex, opened.chapters.length, performance.now())) return false
    setChapter(chapterIndex + 1)
    return true
  }, [opened, chapterIndex, settingsOpen, chaptersOpen, setChapter, windowDrag.dragging])

  useEffect(() => {
    const element = readerRef.current
    if (!element || !opened) return
    const wheel = (event: WheelEvent): void => {
      if (windowDrag.dragging) { event.preventDefault(); return }
      if (!event.ctrlKey && event.deltaY > 0 && advanceFromEnd()) event.preventDefault()
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [opened, advanceFromEnd, windowDrag.dragging])

  useLayoutEffect(() => {
    const element = readerShellRef.current
    if (!opened || !element) return
    const update = (): void => {
      const sideInset = Math.min(12, Math.max(6, element.clientWidth * 0.022))
      const availableWidth = element.clientWidth - sideInset * 2
      const fullWidth = fullToolbarMeasureRef.current?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY
      const compactWidth = compactToolbarMeasureRef.current?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY
      setToolbarMode(fullWidth <= availableWidth ? 'full' : compactWidth <= availableWidth ? 'compact' : 'narrow')
    }
    let disposed = false
    const frame = requestAnimationFrame(update)
    void document.fonts.ready.then(() => { if (!disposed) update() })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [opened])

  useEffect(() => {
    if (!chromeVisible) setMoreOpen(false)
  }, [chromeVisible])

  useEffect(() => {
    if (notice !== '设置已保存') return
    const timer = window.setTimeout(() => setNotice(''), 1000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => window.reader.onStealthVisibility((visible) => {
    if (!visible) {
      setSettingsOpen(false)
      setChaptersOpen(false)
      setChromeVisible(false)
      setMoreOpen(false)
    }
  }), [])

  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  useEffect(() => {
    if (!autoScroll || !opened || settingsOpen || chaptersOpen || windowDrag.dragging) return
    let frame = 0
    let previous = performance.now()
    let carriedPixels = 0
    let endSince: number | null = null
    const tick = (now: number): void => {
      const element = readerRef.current
      if (element) {
        const delta = Math.min((now - previous) / 1000, 0.1)
        carriedPixels += (state?.settings.autoScrollSpeed ?? 36) * delta
        const step = Math.floor(carriedPixels)
        if (step > 0) {
          element.scrollTop += step
          carriedPixels -= step
        }
        if (atChapterEnd(element)) {
          endSince ??= now
          if (now - endSince >= endScreenReadingTime(element, state?.settings.autoScrollSpeed ?? 36)) {
            if (chapterIndex < opened.chapters.length - 1) setChapter(chapterIndex + 1)
            else setAutoScroll(false)
            return
          }
        } else {
          endSince = null
        }
      }
      previous = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [autoScroll, chapterIndex, opened, setChapter, state?.settings.autoScrollSpeed, settingsOpen, chaptersOpen, windowDrag.dragging])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!opened || !readerRef.current || settingsOpen || chaptersOpen || windowDrag.dragging) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'PageDown') {
        event.preventDefault()
        if (!advanceFromEnd()) readerRef.current.scrollBy({ top: readerRef.current.clientHeight * 0.84, behavior: 'smooth' })
      } else if (event.key === 'PageUp') {
        event.preventDefault()
        readerRef.current.scrollBy({ top: -readerRef.current.clientHeight * 0.84, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [opened, settingsOpen, chaptersOpen, advanceFromEnd, windowDrag.dragging])

  const openBook = async (book: BookMeta): Promise<void> => {
    const request = ++openRequest.current
    try {
      const result = await window.reader.openBook(book.id)
      if (request !== openRequest.current) return
      const progress = state?.progress[book.id]
      chapterAdvance.current.reset()
      chapterScrollTarget.current = progress?.scrollTop ?? 0
      setOpened(result)
      setAutoScroll(false)
      setChromeVisible(false)
      setChapterIndex(Math.min(progress?.chapterIndex ?? 0, result.chapters.length - 1))
    } catch (error) {
      if (request !== openRequest.current) return
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const importBooks = async (): Promise<void> => {
    try {
      const books = await window.reader.importBooks()
      if (!books.length) return
      const fresh = await window.reader.getState()
      setState(fresh)
      await openBook(books[0])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const removeBook = async (book: BookMeta): Promise<void> => {
    if (!confirm(`从书架移除《${book.title}》？导入的本地副本也会删除。`)) return
    try {
      await window.reader.removeBook(book.id)
      setState(await window.reader.getState())
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const updateSettings = (patch: Partial<ReaderSettings>): void => {
    setState((current) => current ? { ...current, settings: { ...current.settings, ...patch } } : current)
  }

  const saveSettings = async (): Promise<void> => {
    if (!state) return
    try {
      await window.reader.saveSettings(state.settings)
      setNotice('设置已保存')
      setSettingsOpen(false)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const toggleStealth = async (): Promise<void> => {
    const enabled = !stealth
    setStealth(enabled)
    setSettingsOpen(false)
    setChaptersOpen(false)
    setChromeVisible(false)
    try {
      await window.reader.setStealthEnabled(enabled)
    } catch (error) {
      setStealth(!enabled)
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const onScroll = (): void => {
    if (!opened || !readerRef.current || !state) return
    window.clearTimeout(saveTimer.current)
    const scrollTop = readerRef.current.scrollTop
    pendingProgress.current = { bookId: opened.book.id, progress: { chapterIndex, scrollTop, updatedAt: Date.now() } }
    const elapsed = Date.now() - lastProgressSaveAt.current
    const delay = autoScroll ? Math.max(0, 1000 - elapsed) : 250
    saveTimer.current = window.setTimeout(() => {
      lastProgressSaveAt.current = Date.now()
      const progress: ReadingProgress = { chapterIndex, scrollTop, updatedAt: Date.now() }
      void window.reader.saveProgress(opened.book.id, progress).catch((error) => {
        setNotice(error instanceof Error ? error.message : String(error))
      })
      setState((current) => current ? { ...current, progress: { ...current.progress, [opened.book.id]: progress } } : current)
    }, delay)
  }

  useEffect(() => {
    if (opened) onScroll()
    // Saving on chapter changes is intentional; scroll events handle subsequent updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIndex, opened?.book.id])

  const chapter = opened?.chapters[chapterIndex]
  const paragraphs = useMemo(() => chapter?.content.split(/\n+/).map((item) => item.trim()).filter(Boolean) ?? [], [chapter?.content])
  const compactToolbar = toolbarMode !== 'full'
  const narrowToolbar = toolbarMode === 'narrow'

  if (!state) return <div className="loading">正在打开墨隐阅读…</div>

  const style = {
    '--reader-bg': state.settings.backgroundColor,
    '--reader-bg-alpha': state.settings.backgroundOpacity,
    '--reader-color': state.settings.textColor,
    '--reader-text-alpha': state.settings.textOpacity,
    '--reader-font-size': `${state.settings.fontSize}px`,
    '--reader-line-height': state.settings.lineHeight,
    '--paragraph-space': `${state.settings.paragraphSpacing}px`
  } as React.CSSProperties

  return (
    <main
      className={`app ${opened ? 'is-reading' : 'is-shelf'} ${stealth ? 'is-stealth' : ''}`}
      style={style}
      onMouseLeave={() => stealth && window.reader.pointerLeftWindow()}
    >
      {!stealth && !opened && (
        <header className="titlebar">
          <button className="brand" onClick={() => setOpened(null)}>墨隐阅读</button>
          <div className="window-actions">
            <button title="设置" onClick={() => setSettingsOpen(true)}>设置</button>
            <button title="最小化" onClick={window.reader.minimize}>—</button>
            <button title="隐藏到托盘" onClick={window.reader.close}>×</button>
          </div>
        </header>
      )}

      {!opened ? (
        <>
          <section className="shelf">
            <div className="shelf-heading">
              <div><span className="eyebrow">LOCAL LIBRARY</span><h1>我的小说</h1></div>
              <button className="primary" onClick={importBooks}>＋ 导入 TXT</button>
            </div>
            {state.books.length === 0 ? (
              <button className="empty-state" onClick={importBooks}>
                <span className="empty-icon">文</span>
                <strong>导入第一本小说</strong>
                <small>支持 UTF-8、GBK、GB18030 编码的 TXT 文件</small>
              </button>
            ) : (
              <div className="book-list">
                {state.books.map((book) => {
                  const progress = state.progress[book.id]
                  return (
                    <article className="book-card" key={book.id} onDoubleClick={() => openBook(book)}>
                      <button className="book-main" onClick={() => openBook(book)}>
                        <span className="book-mark">TXT</span>
                        <span className="book-copy">
                          <strong>{book.title}</strong>
                          <small>{progress ? `上次读到第 ${progress.chapterIndex + 1} 章` : '尚未开始'} · {formatSize(book.size)}</small>
                        </span>
                      </button>
                      <button className="delete" title="从书架移除" onClick={() => removeBook(book)}>移除</button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
          <footer className="shelf-footer">
            <span>v{appInfo?.version ?? '—'}</span>
            <button onClick={() => setUpdatesOpen(true)}>检查更新</button>
            <button title={appInfo?.repositoryUrl} onClick={() => void window.reader.openProjectPage().catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}>
              GitHub <span aria-hidden="true">↗</span>
            </button>
          </footer>
        </>
      ) : (
        <section ref={readerShellRef} className={`reader-shell ${chromeVisible ? 'chrome-visible' : ''} ${windowDrag.dragging ? 'is-dragging' : ''}`}>
          <div ref={fullToolbarMeasureRef} className="toolbar-measure toolbar-measure-full" aria-hidden="true">
            <button>‹ 书架</button><button>目录</button><button>设置</button><button>自动滚动</button><button>开启摸鱼</button><button>—</button><button>×</button>
          </div>
          <div ref={compactToolbarMeasureRef} className="toolbar-measure toolbar-measure-compact" aria-hidden="true">
            <button>‹</button><button>目录</button><button>设置</button><button>滚动</button><button>摸鱼</button><button>—</button><button>×</button>
          </div>
          {chromeVisible && (
            <div className={`reader-toolbar toolbar-${toolbarMode}`} onPointerDown={windowDrag.onPointerDown} onClickCapture={windowDrag.onClickCapture} onClick={(event) => event.stopPropagation()}>
              <button onClick={() => setOpened(null)}>{compactToolbar ? '‹' : '‹ 书架'}</button>
              <button onClick={() => setChaptersOpen(true)}>目录</button>
              <button onClick={() => setSettingsOpen(true)}>设置</button>
              <span className="toolbar-spacer" />
              {!narrowToolbar && <button className={autoScroll ? 'active' : ''} onClick={() => setAutoScroll((value) => !value)}>{compactToolbar ? (autoScroll ? '暂停' : '滚动') : (autoScroll ? '暂停滚动' : '自动滚动')}</button>}
              <button className="stealth-button" onClick={toggleStealth}>
                {compactToolbar ? (stealth ? '退出' : '摸鱼') : (stealth ? '退出摸鱼' : '开启摸鱼')}
              </button>
              {!narrowToolbar && <button title="最小化" onClick={window.reader.minimize}>—</button>}
              {!narrowToolbar && <button title="隐藏到托盘" onClick={window.reader.close}>×</button>}
              {narrowToolbar && <button className="more-button" title="更多操作" onClick={() => setMoreOpen((value) => !value)}>•••</button>}
            </div>
          )}

          {chromeVisible && narrowToolbar && moreOpen && (
            <div className="toolbar-more" onClick={(event) => event.stopPropagation()}>
              <button className={autoScroll ? 'active' : ''} onClick={() => { setAutoScroll((value) => !value); setMoreOpen(false) }}>{autoScroll ? '暂停滚动' : '自动滚动'}</button>
              <button onClick={() => { window.reader.minimize(); setMoreOpen(false) }}>最小化</button>
              <button onClick={() => { window.reader.close(); setMoreOpen(false) }}>隐藏到托盘</button>
            </div>
          )}

          <div className="reader" ref={readerRef} onPointerDown={windowDrag.onPointerDown} onClickCapture={windowDrag.onClickCapture} onScroll={onScroll} onClick={() => setChromeVisible((visible) => !visible)}>
            <article className="prose">
              <h2>{chapter?.title}</h2>
              {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </article>
          </div>

          {chromeVisible && <footer className="reader-footer" onClick={(event) => event.stopPropagation()}>
            <button disabled={chapterIndex === 0} onClick={() => setChapter(chapterIndex - 1)}>上一章</button>
            <span>{chapterIndex + 1} / {opened.chapters.length}</span>
            <button disabled={chapterIndex === opened.chapters.length - 1} onClick={() => setChapter(chapterIndex + 1)}>下一章</button>
          </footer>}
        </section>
      )}

      {chaptersOpen && opened && (
        <div className="overlay" onClick={() => setChaptersOpen(false)}>
          <aside className="drawer chapter-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title"><h2>章节目录</h2><button onClick={() => setChaptersOpen(false)}>×</button></div>
            <div className="chapter-list">
              {opened.chapters.map((item, index) => (
                <button className={index === chapterIndex ? 'current' : ''} key={`${item.title}-${index}`} onClick={() => { setChapter(index); setChaptersOpen(false) }}>
                  <span>{item.title}</span><small>{index + 1}</small>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {settingsOpen && (
        <div className="overlay" onClick={() => setSettingsOpen(false)}>
          <aside className="drawer settings-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-title"><div><span className="eyebrow">PREFERENCES</span><h2>阅读设置</h2></div><button onClick={() => setSettingsOpen(false)}>×</button></div>
            <label>字号 <output>{state.settings.fontSize}px</output><input type="range" min="12" max="34" value={state.settings.fontSize} onChange={(event) => updateSettings({ fontSize: Number(event.target.value) })} /></label>
            <label>行距 <output>{state.settings.lineHeight.toFixed(1)}</output><input type="range" min="1.2" max="2.8" step="0.1" value={state.settings.lineHeight} onChange={(event) => updateSettings({ lineHeight: Number(event.target.value) })} /></label>
            <label>段落间距 <output>{state.settings.paragraphSpacing}px</output><input type="range" min="0" max="30" value={state.settings.paragraphSpacing} onChange={(event) => updateSettings({ paragraphSpacing: Number(event.target.value) })} /></label>
            <label>背景透明度 <output>{Math.round(state.settings.backgroundOpacity * 100)}%</output><input type="range" min="0" max="1" step="0.02" value={state.settings.backgroundOpacity} onChange={(event) => updateSettings({ backgroundOpacity: Number(event.target.value) })} /></label>
            <label>文字透明度 <output>{Math.round(state.settings.textOpacity * 100)}%</output><input type="range" min="0.2" max="1" step="0.02" value={state.settings.textOpacity} onChange={(event) => updateSettings({ textOpacity: Number(event.target.value) })} /></label>
            <label>自动滚动速度 <output>{state.settings.autoScrollSpeed}px/秒</output><input type="range" min="10" max="120" step="2" value={state.settings.autoScrollSpeed} onChange={(event) => updateSettings({ autoScrollSpeed: Number(event.target.value) })} /></label>
            <div className="color-row"><label>背景色<input type="color" value={state.settings.backgroundColor} onChange={(event) => updateSettings({ backgroundColor: event.target.value })} /></label><label>文字色<input type="color" value={state.settings.textColor} onChange={(event) => updateSettings({ textColor: event.target.value })} /></label></div>
            <label className="check"><input type="checkbox" checked={state.settings.alwaysOnTop} onChange={(event) => { updateSettings({ alwaysOnTop: event.target.checked }); void window.reader.setAlwaysOnTop(event.target.checked) }} />窗口始终置顶</label>
            <label className="check"><input type="checkbox" checked={state.settings.hideFromTaskbar} onChange={(event) => updateSettings({ hideFromTaskbar: event.target.checked })} />在任务栏中隐藏</label>
            <p className="settings-note">隐藏后仍可通过系统托盘恢复窗口；在 macOS 上对应隐藏 Dock 图标。</p>
            <p className="settings-note">摸鱼模式不会跨启动自动开启，避免重新打开后找不到窗口。</p>
            <button className="primary save" onClick={saveSettings}>保存设置</button>
          </aside>
        </div>
      )}

      {updatesOpen && !opened && <UpdatePanel currentVersion={appInfo?.version ?? '—'} close={() => setUpdatesOpen(false)} beforeInstall={async () => {
        window.clearTimeout(saveTimer.current)
        const pending = pendingProgress.current
        if (pending) await window.reader.saveProgress(pending.bookId, pending.progress)
      }} />}
      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}</button>}
      <ResizeHandles />
    </main>
  )
}

export default App
