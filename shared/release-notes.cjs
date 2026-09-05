const { Marked } = require('marked')
const { compile } = require('html-to-text')

const maximumLength = 100_000
const markdown = new Marked({ async: false, gfm: true, breaks: true })
const toText = compile({
  wordwrap: false,
  limits: { maxInputLength: maximumLength * 2, maxDepth: 40, maxChildNodes: 5000 },
  selectors: [
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(selector => ({ selector, options: { uppercase: false } })),
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'ul', options: { itemPrefix: '• ' } },
    ...['img', 'script', 'style', 'iframe', 'object', 'embed', 'svg', 'template'].map(selector => ({ selector, format: 'skip' }))
  ]
})

// Shared by the main process and packager. The intermediate HTML is parsed only;
// it is never inserted into a browser DOM, so no scripts, attributes or requests run.
function plainReleaseNotes(source) {
  if (typeof source !== 'string' || !source.trim()) return ''
  const truncated = source.length > maximumLength
  const text = toText(markdown.parse(source.slice(0, maximumLength))).replace(/\n{3,}/g, '\n\n').trim()
  return text.slice(0, maximumLength) + (truncated || text.length > maximumLength ? '\n\n更新说明较长，请前往 GitHub 发布页查看完整内容。' : '')
}

module.exports = { plainReleaseNotes }
