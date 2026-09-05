import { describe, expect, it } from 'vitest'
import { atChapterEnd, ChapterAdvanceGate, endScreenReadingTime } from './chapter-navigation'

describe('chapter navigation', () => {
  const bottom = { scrollTop: 500, clientHeight: 500, scrollHeight: 1000 }
  it('advances on continued downward reading only at the bottom', () => {
    const gate = new ChapterAdvanceGate()
    expect(gate.advance({ ...bottom, scrollTop: 300 }, 0, 3, 0)).toBe(false)
    expect(gate.advance(bottom, 0, 3, 0)).toBe(true)
  })
  it('does not jump past the final chapter', () => {
    expect(new ChapterAdvanceGate().advance(bottom, 2, 3, 0)).toBe(false)
  })
  it('debounces trackpad inertia across short chapters', () => {
    const gate = new ChapterAdvanceGate()
    expect(gate.advance(bottom, 0, 4, 100)).toBe(true)
    expect(gate.advance(bottom, 1, 4, 150)).toBe(false)
    expect(gate.advance(bottom, 1, 4, 899)).toBe(false)
    expect(gate.advance(bottom, 1, 4, 900)).toBe(true)
    gate.reset()
    expect(gate.advance(bottom, 0, 4, 910)).toBe(true)
  })
  it('handles short chapters and fractional scroll positions without reacting to zero-height views', () => {
    expect(atChapterEnd({ scrollTop: 0, clientHeight: 500, scrollHeight: 200 })).toBe(true)
    expect(atChapterEnd({ ...bottom, scrollTop: 499.5 })).toBe(true)
    expect(atChapterEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBe(false)
  })
  it('leaves time for the last screen instead of instantly skipping short chapters', () => {
    expect(endScreenReadingTime(bottom, 50)).toBe(10000)
    expect(endScreenReadingTime({ ...bottom, scrollHeight: 200 }, 50)).toBe(4000)
    expect(endScreenReadingTime({ ...bottom, scrollHeight: 0 }, 50)).toBe(1000)
  })
})
