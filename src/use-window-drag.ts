import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

const interactive = 'button, a, input, select, textarea, [role="button"], [contenteditable="true"]'

export function useWindowDrag(scope: string | null) {
  const [dragging, setDragging] = useState(false)
  const cancel = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => () => cancel.current?.(), [scope])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || event.pointerType !== 'mouse' || !event.isPrimary) return
    suppressClick.current = false
    if (event.target instanceof Element && event.target.closest(interactive)) return
    cancel.current?.()
    const target = event.currentTarget
    const id = event.pointerId
    const startX = event.screenX
    const startY = event.screenY
    let started = false
    let stopped = false
    let frame = 0
    const stop = (): void => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(frame)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', cancelled)
      target.removeEventListener('lostpointercapture', cancelled)
      window.removeEventListener('blur', stop)
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id)
      window.reader.endWindowDrag()
      setDragging(false)
      cancel.current = null
    }
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== id) return
      if (!(next.buttons & 1)) { stop(); return }
      if (!started && Math.hypot(next.screenX - startX, next.screenY - startY) < 6) return
      if (!started) {
        started = true
        suppressClick.current = true
        setDragging(true)
      }
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        if (!stopped) window.reader.moveWindowDrag()
      })
    }
    const up = (next: PointerEvent): void => {
      if (next.pointerId !== id) return
      if (started) window.reader.moveWindowDrag()
      stop()
    }
    const cancelled = (next: PointerEvent): void => { if (next.pointerId === id) stop() }
    cancel.current = stop
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', cancelled)
    target.addEventListener('lostpointercapture', cancelled)
    window.addEventListener('blur', stop)
    try {
      target.setPointerCapture(id)
      window.reader.startWindowDrag()
    } catch (error) {
      stop()
      console.error('[window-drag-start-failed]', error)
    }
  }, [])

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    if (!suppressClick.current || event.detail === 0) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return { dragging, onPointerDown, onClickCapture }
}
