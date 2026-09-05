import { describe, expect, it } from 'vitest'
import { parseChapters } from './chapter-parser'

describe('parseChapters', () => {
  it('preserves a preface and recognizes Chinese chapter titles', () => {
    const chapters = parseChapters('简介内容\n第一章 开始\n这是第一章的内容。\n第二章 继续\n这是第二章的内容。')
    expect(chapters).toEqual([
      { title: '正文', content: '简介内容' },
      { title: '第一章 开始', content: '这是第一章的内容。' },
      { title: '第二章 继续', content: '这是第二章的内容。' }
    ])
  })

  it('returns one body chapter when no title is detected', () => {
    expect(parseChapters('第一段\n\n第二段')).toEqual([
      { title: '正文', content: '第一段\n\n第二段' }
    ])
  })

  it('recognizes English chapter titles', () => {
    expect(parseChapters('Chapter 1 Start\nContent')).toEqual([
      { title: 'Chapter 1 Start', content: 'Content' }
    ])
  })
})
