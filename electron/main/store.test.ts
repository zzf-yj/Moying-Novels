import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.MOYING_TEST_DATA_DIRECTORY }
}))

import { AppStore } from './store'

let testDirectory = ''

beforeEach(async () => {
  testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'moying-store-'))
  process.env.MOYING_TEST_DATA_DIRECTORY = testDirectory
})

afterEach(async () => {
  delete process.env.MOYING_TEST_DATA_DIRECTORY
  await fs.rm(testDirectory, { recursive: true, force: true })
})

describe('AppStore', () => {
  it('serializes concurrent writes without losing progress', async () => {
    const store = new AppStore()
    await store.initialize()
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.saveProgress(`book-${index}`, {
      chapterIndex: index,
      scrollTop: index * 10,
      updatedAt: index
    })))
    await store.flush()

    const persisted = JSON.parse(await fs.readFile(path.join(testDirectory, 'state.json'), 'utf8'))
    expect(Object.keys(persisted.progress)).toHaveLength(20)
    expect(persisted.progress['book-19'].scrollTop).toBe(190)
  })

  it('backs up malformed JSON before restoring defaults', async () => {
    await fs.writeFile(path.join(testDirectory, 'state.json'), '{invalid json', 'utf8')
    const store = new AppStore()
    await store.initialize()

    const files = await fs.readdir(testDirectory)
    expect(files.some((file) => /^state\.corrupt-\d+\.json$/.test(file))).toBe(true)
    expect(store.snapshot().books).toEqual([])
  })
})
