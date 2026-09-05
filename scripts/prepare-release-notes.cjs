const fs = require('node:fs/promises')
const path = require('node:path')
const { plainReleaseNotes } = require('../shared/release-notes.cjs')

// Embed plain notes into latest*.yml before artifacts are built. Old clients then
// use these notes instead of falling back to GitHub's HTML Atom feed.
module.exports = async function prepareReleaseNotes(context) {
  const version = context.packager.appInfo.version
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release notes require a stable version')
  const source = await fs.readFile(path.join(context.packager.projectDir, 'docs', 'releases', `v${version}.md`), 'utf8')
  const releaseNotes = plainReleaseNotes(source)
  if (!releaseNotes) throw new Error(`Release notes for ${version} are empty`)
  context.packager.config.releaseInfo = { ...context.packager.config.releaseInfo, releaseNotes }
}
