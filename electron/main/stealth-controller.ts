import { BrowserWindow, screen } from 'electron'

export class StealthController {
  private enabled = false
  private concealed = false
  private monitorTimer?: NodeJS.Timeout
  private leftAt?: number
  private interactionActive = false
  private trayHidden = false

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.leftAt = undefined
    if (enabled) this.startMonitor()
    else {
      this.stopMonitor()
      this.reveal()
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  pointerLeft(): void {
    if (this.enabled && !this.concealed && !this.leftAt) this.leftAt = Date.now()
  }

  setInteractionActive(active: boolean): void {
    this.interactionActive = active
    this.leftAt = undefined
  }

  toggleWindowVisibility(): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) return

    if (!window.isVisible() || window.isMinimized()) {
      this.trayHidden = false
      if (window.isMinimized()) window.restore()
      this.reveal()
      window.showInactive()
    } else {
      this.hideToTray()
    }
  }

  hideToTray(): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) return
    this.trayHidden = true
    this.concealed = false
    this.leftAt = undefined
    window.setIgnoreMouseEvents(false)
    window.setOpacity(1)
    window.hide()
  }

  reveal(): void {
    const window = this.getWindow()
    this.concealed = false
    this.trayHidden = false
    this.leftAt = undefined
    if (!window || window.isDestroyed()) return
    window.setIgnoreMouseEvents(false)
    window.setOpacity(1)
    window.webContents.send('stealth:visibility', true)
  }

  destroy(): void {
    this.stopMonitor()
  }

  private conceal(): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed() || !this.enabled) return
    this.concealed = true
    window.webContents.send('stealth:visibility', false)
    window.setOpacity(0)
    window.setIgnoreMouseEvents(true, { forward: true })

  }

  private startMonitor(): void {
    this.stopMonitor()
    this.monitorTimer = setInterval(() => {
      const activeWindow = this.getWindow()
      if (!this.enabled || this.interactionActive || this.trayHidden || !activeWindow || activeWindow.isDestroyed() || !activeWindow.isVisible() || activeWindow.isMinimized()) return
      const isInside = this.contains(screen.getCursorScreenPoint(), activeWindow.getBounds())
      if (this.concealed) {
        if (isInside) this.reveal()
        return
      }
      if (isInside) {
        this.leftAt = undefined
      } else if (!this.leftAt) {
        this.leftAt = Date.now()
      } else if (Date.now() - this.leftAt >= 130) {
        this.conceal()
      }
    }, 60)
  }

  private contains(point: Electron.Point, bounds: Electron.Rectangle): boolean {
    return (
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height
    )
  }

  private stopMonitor(): void {
    clearInterval(this.monitorTimer)
    this.monitorTimer = undefined
    this.leftAt = undefined
  }
}
