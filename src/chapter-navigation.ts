export interface ScrollMetrics { scrollTop: number; clientHeight: number; scrollHeight: number }

export function atChapterEnd(element: ScrollMetrics): boolean {
  return element.clientHeight > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 2
}

// Trackpads emit many wheel events per gesture. Do not skip several short chapters.
export class ChapterAdvanceGate {
  private blockedUntil = 0
  reset(): void { this.blockedUntil = 0 }
  advance(element: ScrollMetrics, chapter: number, count: number, now: number): boolean {
    if (!atChapterEnd(element) || chapter >= count - 1 || now < this.blockedUntil) return false
    this.blockedUntil = now + 800
    return true
  }
}

// At the bottom the final screen stops moving; allow time to read it before switching.
export function endScreenReadingTime(element: ScrollMetrics, pixelsPerSecond: number): number {
  return Math.max(1000, Math.min(element.clientHeight, element.scrollHeight) / Math.max(1, pixelsPerSecond) * 1000)
}
