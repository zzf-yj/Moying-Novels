import type { Chapter } from '../../shared/types'

const chapterPatterns = [
  /^\s*第[零〇一二三四五六七八九十百千万两\d]+[章节回卷部篇集]\s*.{0,40}$/,
  /^\s*[卷部篇][零〇一二三四五六七八九十百千万两\d]+\s*.{0,40}$/,
  /^\s*(序章|序言|前言|楔子|引子|后记|尾声|终章|番外(?:篇)?(?:\s*.{0,30})?)\s*$/,
  /^\s*chapter\s+\d+(?:\s*.{0,40})?$/i,
  /^\s*\d{1,5}[.、]\s*[^\n]{1,40}$/
]

function isChapterTitle(line: string): boolean {
  const candidate = line.trim()
  if (!candidate || candidate.length > 55) return false
  return chapterPatterns.some((pattern) => pattern.test(candidate))
}

export function parseChapters(rawText: string): Chapter[] {
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!text) return [{ title: '正文', content: '' }]

  const lines = text.split('\n')
  const chapters: Chapter[] = []
  let title = '正文'
  let buffer: string[] = []

  const flush = (): void => {
    const content = buffer.join('\n').trim()
    if (content || chapters.length === 0) chapters.push({ title, content })
    buffer = []
  }

  for (const line of lines) {
    if (isChapterTitle(line)) {
      if (buffer.some((item) => item.trim()) || chapters.length > 0) flush()
      title = line.trim()
    } else {
      buffer.push(line)
    }
  }
  flush()

  if (chapters.length > 1 && chapters[0].title === '正文' && !chapters[0].content) {
    chapters.shift()
  }
  return chapters
}
