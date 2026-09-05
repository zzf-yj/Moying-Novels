import { BrowserWindow, screen } from 'electron'
import { dipStep, snapDown, snapNearest } from './dip-scale'

// Use Electron's screen coordinates (DIP), not renderer pixels, for mixed-DPI displays.
export class WindowDragController {
  private origin?: { cursor: Electron.Point; bounds: Electron.Rectangle }
  private step = 1
  constructor(private readonly getWindow: () => BrowserWindow | null, private readonly interaction: (active: boolean) => void) {}
  isActive(): boolean { return this.origin !== undefined }
  start(): void {
    this.stop()
    const window = this.getWindow()
    if (!window || window.isDestroyed() || window.isMinimized() || !window.isVisible() || window.isMaximized()) return
    const bounds = window.getBounds()
    const step = dipStep(screen.getDisplayMatching(bounds).scaleFactor)
    const size = {
      width: snapDown(bounds.width, step),
      height: snapDown(bounds.height, step)
    }
    if (size.width !== bounds.width || size.height !== bounds.height) {
      window.setBounds({ x: bounds.x, y: bounds.y, ...size }, false)
    }
    this.step = step
    this.origin = { cursor: screen.getCursorScreenPoint(), bounds: { ...bounds, ...size } }
    this.interaction(true)
  }
  move(): void {
    const window = this.getWindow()
    if (!this.origin) return
    if (!window || window.isDestroyed() || !window.isVisible() || window.isMinimized() || window.isMaximized()) {
      this.stop()
      return
    }
    const cursor = screen.getCursorScreenPoint()
    // setPosition re-applies the current size, whose DIP value is fractional on fractional-DPI
    // displays; each DIP<->pixel conversion then inflates the window by ~1 DIP. Pin the snapped
    // gesture-start size and keep every edge on whole physical pixels so moves cannot feed the
    // rounding back in or make the on-screen size wobble.
    window.setBounds({
      x: snapNearest(this.origin.bounds.x + cursor.x - this.origin.cursor.x, this.step),
      y: snapNearest(this.origin.bounds.y + cursor.y - this.origin.cursor.y, this.step),
      width: this.origin.bounds.width,
      height: this.origin.bounds.height
    }, false)
  }
  stop(): void {
    if (!this.origin) return
    this.origin = undefined
    this.interaction(false)
  }
}
