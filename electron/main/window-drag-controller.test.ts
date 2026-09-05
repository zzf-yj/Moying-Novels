import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const cursor = vi.hoisted(() => ({ x: 200, y: 300 }))
vi.mock('electron', () => ({ screen: { getCursorScreenPoint: () => ({ ...cursor }) } }))
import type { BrowserWindow } from 'electron'
import { WindowDragController } from './window-drag-controller'
import { StealthController } from './stealth-controller'

function setup() {
  const window = {
    isDestroyed: vi.fn(() => false), isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false), isMaximized: vi.fn(() => false),
    getBounds: () => ({ x: 100, y: 150, width: 440, height: 640 }), setPosition: vi.fn()
  }
  const interaction = vi.fn()
  return { window, interaction, controller: new WindowDragController(() => window as unknown as BrowserWindow, interaction) }
}
beforeEach(() => { cursor.x = 200; cursor.y = 300 })
afterEach(() => vi.useRealTimers())

describe('window dragging', () => {
  it('keeps clicks stationary until a move is requested', () => {
    const { controller, window, interaction } = setup()
    controller.start()
    expect(window.setPosition).not.toHaveBeenCalled()
    controller.stop()
    expect(interaction.mock.calls).toEqual([[true], [false]])
    expect(controller.isActive()).toBe(false)
  })
  it('uses screen DIP deltas without resizing, including negative monitor coordinates', () => {
    const { controller, window } = setup()
    controller.start()
    cursor.x = -220; cursor.y = 350
    controller.move()
    expect(window.setPosition).toHaveBeenLastCalledWith(-320, 200, false)
    cursor.x = -210
    controller.move()
    expect(window.setPosition).toHaveBeenLastCalledWith(-310, 200, false)
  })
  it('ignores late movements after ending a gesture', () => {
    const { controller, window, interaction } = setup()
    controller.start(); controller.stop(); controller.stop(); controller.move()
    expect(window.setPosition).not.toHaveBeenCalled()
    expect(interaction.mock.calls).toEqual([[true], [false]])
  })
  it('releases interaction protection if the window becomes unavailable', () => {
    const { controller, window, interaction } = setup()
    controller.start()
    window.isVisible.mockReturnValue(false)
    controller.move()
    expect(controller.isActive()).toBe(false)
    expect(interaction).toHaveBeenLastCalledWith(false)
    expect(window.setPosition).not.toHaveBeenCalled()
  })
  it('does not begin dragging maximized or minimized windows', () => {
    const { controller, window, interaction } = setup()
    window.isMaximized.mockReturnValue(true)
    controller.start()
    expect(controller.isActive()).toBe(false)
    expect(interaction).not.toHaveBeenCalled()
  })
  it('prevents mouse-away hiding while dragging and resumes it after release', () => {
    vi.useFakeTimers()
    const { window } = setup()
    const nativeWindow = { ...window, setOpacity: vi.fn(), setIgnoreMouseEvents: vi.fn(), webContents: { send: vi.fn() } }
    const stealth = new StealthController(() => nativeWindow as unknown as BrowserWindow)
    const drag = new WindowDragController(() => nativeWindow as unknown as BrowserWindow, active => stealth.setInteractionActive(active))
    try {
      stealth.setEnabled(true)
      drag.start()
      cursor.x = 1000
      stealth.pointerLeft()
      vi.advanceTimersByTime(500)
      expect(nativeWindow.setOpacity).not.toHaveBeenCalledWith(0)
      drag.stop()
      vi.advanceTimersByTime(300)
      expect(nativeWindow.setOpacity).toHaveBeenCalledWith(0)
    } finally { drag.stop(); stealth.destroy() }
    expect(vi.getTimerCount()).toBe(0)
  })
})
