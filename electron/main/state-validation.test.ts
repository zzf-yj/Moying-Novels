import { describe, expect, it } from 'vitest'
import { defaultSettings } from './defaults'
import { normalizePersistedState } from './state-validation'

describe('normalizePersistedState', () => {
  it('uses safe defaults for malformed state', () => {
    const state = normalizePersistedState({ books: 'invalid', progress: [], settings: null }, defaultSettings)
    expect(state.books).toEqual([])
    expect(state.progress).toEqual({})
    expect(state.settings).toEqual(defaultSettings)
  })

  it('clamps settings and discards malformed records', () => {
    const state = normalizePersistedState({
      books: [
        { id: 'book-1', title: '测试', originalName: '测试.txt', encoding: 'UTF-8', size: 100, addedAt: 1 },
        { title: '缺少 ID' }
      ],
      progress: {
        'book-1': { chapterIndex: 2.8, scrollTop: -10, updatedAt: 3 },
        broken: { chapterIndex: 'bad' }
      },
      settings: {
        fontSize: 100,
        lineHeight: 0,
        textColor: 'not-a-color',
        backgroundOpacity: -1,
        windowBounds: { width: 10, height: 20, x: 12.4, y: 18.6 }
      }
    }, defaultSettings)

    expect(state.books).toHaveLength(1)
    expect(state.progress).toEqual({ 'book-1': { chapterIndex: 2, scrollTop: 0, updatedAt: 3 } })
    expect(state.settings.fontSize).toBe(34)
    expect(state.settings.lineHeight).toBe(1.2)
    expect(state.settings.textColor).toBe(defaultSettings.textColor)
    expect(state.settings.backgroundOpacity).toBe(0)
    expect(state.settings.windowBounds).toEqual({ width: 240, height: 180, x: 12, y: 19 })
  })
})
