import type { BookMeta, PersistedState, ReaderSettings, ReadingProgress, WindowBounds } from '../../shared/types'
import { bossKeyChoices } from '../../shared/types'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
)

const clampedNumber = (value: unknown, fallback: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)))
)

const color = (value: unknown, fallback: string): string => (
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
)

const normalizeBounds = (value: unknown, fallback: WindowBounds): WindowBounds => {
  const input = isRecord(value) ? value : {}
  const bounds: WindowBounds = {
    width: Math.round(clampedNumber(input.width, fallback.width, 240, 10000)),
    height: Math.round(clampedNumber(input.height, fallback.height, 180, 10000))
  }
  if (typeof input.x === 'number' && Number.isFinite(input.x)) bounds.x = Math.round(input.x)
  if (typeof input.y === 'number' && Number.isFinite(input.y)) bounds.y = Math.round(input.y)
  return bounds
}

const normalizeBook = (value: unknown): BookMeta | undefined => {
  if (!isRecord(value)) return undefined
  if (
    typeof value.id !== 'string' || !value.id ||
    typeof value.title !== 'string' ||
    typeof value.originalName !== 'string'
  ) return undefined
  return {
    id: value.id,
    title: value.title,
    originalName: value.originalName,
    encoding: typeof value.encoding === 'string' ? value.encoding : '未知',
    size: Math.max(0, finiteNumber(value.size, 0)),
    addedAt: Math.max(0, finiteNumber(value.addedAt, 0))
  }
}

const normalizeProgress = (value: unknown): ReadingProgress | undefined => {
  if (!isRecord(value)) return undefined
  if (typeof value.chapterIndex !== 'number' || !Number.isFinite(value.chapterIndex)) return undefined
  return {
    chapterIndex: Math.max(0, Math.floor(value.chapterIndex)),
    scrollTop: Math.max(0, finiteNumber(value.scrollTop, 0)),
    updatedAt: Math.max(0, finiteNumber(value.updatedAt, 0))
  }
}

export function normalizePersistedState(value: unknown, defaults: ReaderSettings): PersistedState {
  const input = isRecord(value) ? value : {}
  const settingsInput = isRecord(input.settings) ? input.settings : {}
  const settings: ReaderSettings = {
    fontSize: clampedNumber(settingsInput.fontSize, defaults.fontSize, 12, 34),
    lineHeight: clampedNumber(settingsInput.lineHeight, defaults.lineHeight, 1.2, 2.8),
    paragraphSpacing: clampedNumber(settingsInput.paragraphSpacing, defaults.paragraphSpacing, 0, 30),
    textColor: color(settingsInput.textColor, defaults.textColor),
    backgroundColor: color(settingsInput.backgroundColor, defaults.backgroundColor),
    backgroundOpacity: clampedNumber(settingsInput.backgroundOpacity, defaults.backgroundOpacity, 0, 1),
    textOpacity: clampedNumber(settingsInput.textOpacity, defaults.textOpacity, 0.2, 1),
    alwaysOnTop: typeof settingsInput.alwaysOnTop === 'boolean' ? settingsInput.alwaysOnTop : defaults.alwaysOnTop,
    hideFromTaskbar: typeof settingsInput.hideFromTaskbar === 'boolean' ? settingsInput.hideFromTaskbar : defaults.hideFromTaskbar,
    autoScrollSpeed: clampedNumber(settingsInput.autoScrollSpeed, defaults.autoScrollSpeed, 10, 120),
    bossKey: typeof settingsInput.bossKey === 'string' && bossKeyChoices.some((choice) => choice.value === settingsInput.bossKey)
      ? settingsInput.bossKey
      : defaults.bossKey,
    windowBounds: normalizeBounds(settingsInput.windowBounds, defaults.windowBounds)
  }

  const books = (Array.isArray(input.books) ? input.books : [])
    .map(normalizeBook)
    .filter((book): book is BookMeta => Boolean(book))

  const progress: Record<string, ReadingProgress> = {}
  if (isRecord(input.progress)) {
    for (const [bookId, candidate] of Object.entries(input.progress)) {
      const normalized = normalizeProgress(candidate)
      if (normalized) progress[bookId] = normalized
    }
  }

  return { books, progress, settings }
}
