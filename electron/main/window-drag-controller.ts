import { BrowserWindow, screen } from 'electron'

// Sizes whose DIP value maps to fractional physical pixels drift ±1px on every
// DIP<->pixel roundtrip (fractional-DPI displays, e.g. 150%); snap down to the
// nearest size that lands on whole pixels so repeated bounds updates are stable.
function snapToWholePixels(size: number, scale: number): number {
  let snapped = Math.floor(size)
  while (snapped > 1 && !Number.isInteger(snapped * scale)) snapped -= 1
  return snapped
}

// Use Electron's screen coordinates (DIP), not renderer pixels, for mixed-DPI displays.
export class WindowDragController {
  private origin?: { cursor: Electron.Point; bounds: Electron.Rectangle }
  constructor(private readonly getWindow: () => BrowserWindow | null, private readonly interaction: (active: boolean) => void) {}
  isActive(): boolean { return this.origin !== undefined }
  start(): void {
    this.stop()
    const window = this.getWindow()
    if (!window || window.isDestroyed() || window.isMinimized() || !window.isVisible() || window.isMaximized()) return
    const bounds = window.getBounds()
    const scale = screen.getDisplayMatching(bounds).scaleFactor
    const size = {
      width: snapToWholePixels(bounds.width, scale),
      height: snapToWholePixels(bounds.height, scale)
    }
    if (size.width !== bounds.width || size.height !== bounds.height) {
      window.setBounds({ x: bounds.x, y: bounds.y, ...size }, false)
    }
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
    // gesture-start size so repeated moves cannot feed the rounding back in.
    window.setBounds({
      x: Math.round(this.origin.bounds.x + cursor.x - this.origin.cursor.x),
      y: Math.round(this.origin.bounds.y + cursor.y - this.origin.cursor.y),
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
