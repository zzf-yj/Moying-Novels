import { describe, expect, it } from 'vitest'
import { atChapterEnd, endScreenReadingTime, readingChapterAt } from './chapter-navigation'

describe('chapter navigation', () => {
  const bottom = { scrollTop: 500, clientHeight: 500, scrollHeight: 1000 }
  it('detects the end of the rendered content', () => {
    expect(atChapterEnd({ ...bottom, scrollTop: 300 })).toBe(false)
    expect(atChapterEnd(bottom)).toBe(true)
    expect(atChapterEnd({ scrollTop: 0, clientHeight: 500, scrollHeight: 200 })).toBe(true)
    expect(atChapterEnd({ ...bottom, scrollTop: 499.5 })).toBe(true)
    expect(atChapterEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBe(false)
  })
  it('finds the chapter under the reading line across contiguous sections', () => {
    const tops = [0, 800, 1600]
    const heights = [800, 800, 800]
    expect(readingChapterAt(tops, heights, 10)).toBe(0)
    expect(readingChapterAt(tops, heights, 900)).toBe(1)
    expect(readingChapterAt(tops, heights, 1600)).toBe(2)
    expect(readingChapterAt(tops, heights, 9999)).toBe(2)
  })
  it('clamps lines above the first section and reports empty layouts', () => {
    expect(readingChapterAt([400], [400], 0)).toBe(0)
    expect(readingChapterAt([400], [400], 400)).toBe(0)
    expect(readingChapterAt([], [], 100)).toBe(null)
  })
  it('leaves time for the last screen instead of instantly skipping short chapters', () => {
    expect(endScreenReadingTime(bottom, 50)).toBe(10000)
    expect(endScreenReadingTime({ ...bottom, scrollHeight: 200 }, 50)).toBe(4000)
    expect(endScreenReadingTime({ ...bottom, scrollHeight: 0 }, 50)).toBe(1000)
  })
})
