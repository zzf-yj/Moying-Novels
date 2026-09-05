import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { plainReleaseNotes } from './release-notes.cjs'

describe('release notes formatting', () => {
  it('formats GitHub HTML as paragraphs and lists without literal tags', () => {
    const text = plainReleaseNotes('<h1>墨隐阅读 v0.2.2</h1><h2>更新内容</h2><ul><li>正文拖动</li><li>自动续章</li></ul><p>下载 <code>moying-novels.exe</code></p>')
    expect(text).toContain('墨隐阅读 v0.2.2\n\n更新内容')
    expect(text).toContain('• 正文拖动\n• 自动续章')
    expect(text).toContain('下载 moying-novels.exe')
    expect(text).not.toMatch(/<\/?(?:h1|li|ul|p|code)>/)
  })
  it('formats Markdown consistently with HTML', () => {
    expect(plainReleaseNotes('## 更新内容\n\n- **拖动**\n- `自动续章`')).toBe(plainReleaseNotes('<h2>更新内容</h2><ul><li><strong>拖动</strong></li><li><code>自动续章</code></li></ul>'))
  })
  it('discards executable and remote-media markup and decodes entities', () => {
    const text = plainReleaseNotes('<p>字体 &amp; 颜色</p><script>alert(1)</script><style>body{display:none}</style><img src="https://invalid.test/tracker" onerror="alert(2)"><iframe>危险内容</iframe><p><a href="javascript:alert(3)">正常文字</a></p>')
    expect(text).toBe('字体 & 颜色\n\n正常文字')
  })
  it('handles missing input and limits excessive notes', () => {
    expect(plainReleaseNotes(undefined)).toBe('')
    expect(plainReleaseNotes('')).toBe('')
    expect(plainReleaseNotes('内容'.repeat(60000))).toContain('查看完整内容')
  })
  it('embeds the same plain text for legacy updaters at package time', async () => {
    const require = createRequire(import.meta.url)
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const hook = require('../scripts/prepare-release-notes.cjs')
    const context = { packager: { projectDir: process.cwd(), appInfo: { version: pkg.version }, config: { releaseInfo: { releaseName: '保留标题', releaseNotes: '' } } } }
    await hook(context)
    expect(context.packager.config.releaseInfo.releaseNotes).toBe(plainReleaseNotes(readFileSync(`docs/releases/v${pkg.version}.md`, 'utf8')))
    expect(context.packager.config.releaseInfo.releaseName).toBe('保留标题')
  })
})
