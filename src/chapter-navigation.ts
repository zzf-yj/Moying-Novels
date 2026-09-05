export interface ScrollMetrics { scrollTop: number; clientHeight: number; scrollHeight: number }

export function atChapterEnd(element: ScrollMetrics): boolean {
  return element.clientHeight > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 2
}

// Sections are ordered and contiguous; the reading line falls into the last one it passed.
// A line above the first section (top padding, restored offsets) clamps to that section.
export function readingChapterAt(tops: number[], heights: number[], line: number): number | null {
  if (!tops.length) return null
  let found = 0
  for (let index = 0; index < tops.length; index++) {
    if (tops[index] <= line) found = index
  }
  return found
}

// At the final end of the book the last screen stops moving; allow time to read it before stopping.
export function endScreenReadingTime(element: ScrollMetrics, pixelsPerSecond: number): number {
  return Math.max(1000, Math.min(element.clientHeight, element.scrollHeight) / Math.max(1, pixelsPerSecond) * 1000)
}
