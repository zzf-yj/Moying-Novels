import { BrowserWindow, screen } from 'electron'

// Use Electron's screen coordinates (DIP), not renderer pixels, for mixed-DPI displays.
export class WindowDragController {
  private origin?: { cursor: Electron.Point; bounds: Electron.Rectangle }
  constructor(private readonly getWindow: () => BrowserWindow | null, private readonly interaction: (active: boolean) => void) {}
  isActive(): boolean { return this.origin !== undefined }
  start(): void {
    this.stop()
    const window = this.getWindow()
    if (!window || window.isDestroyed() || window.isMinimized() || !window.isVisible() || window.isMaximized()) return
    this.origin = { cursor: screen.getCursorScreenPoint(), bounds: window.getBounds() }
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
    window.setPosition(
      Math.round(this.origin.bounds.x + cursor.x - this.origin.cursor.x),
      Math.round(this.origin.bounds.y + cursor.y - this.origin.cursor.y), false
    )
  }
  stop(): void {
    if (!this.origin) return
    this.origin = undefined
    this.interaction(false)
  }
}
