// Run on macOS after packaging, before uploading any release artifacts.
// Verify the delivered archives, not just the intermediate .app directories.
const { existsSync, mkdtempSync, mkdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const pkg = require('../package.json')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', timeout: 120_000, ...options
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} failed (exit ${result.status}, signal ${result.signal})`)
  }
}

function verifyApp(appPath, arch) {
  if (!existsSync(appPath)) throw new Error(`Missing app: ${appPath}`)
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
  run('/usr/bin/codesign', ['--display', '--verbose=2', appPath])
  const executable = path.join(appPath, 'Contents', 'MacOS', pkg.build.productName)
  run('/usr/bin/lipo', [executable, '-verify_arch', arch === 'x64' ? 'x86_64' : 'arm64'])
  // Test native Electron loading without opening a window or touching reader data.
  // This is a runtime smoke test, not a Gatekeeper/notarization or UI acceptance test.
  if (arch === process.arch) {
    run(executable, ['-e', 'console.log("Electron runtime OK", process.versions.electron)'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30_000
    })
  }
}

function main() {
  if (process.platform !== 'darwin') throw new Error('macOS verification requires a Mac runner')
  const releaseDir = path.resolve(__dirname, '../release')
  for (const arch of ['x64', 'arm64']) {
    for (const extension of ['zip', 'dmg']) {
      const archive = path.join(releaseDir, `${pkg.build.productName}-${pkg.version}-${arch}.${extension}`)
      if (!existsSync(archive)) throw new Error(`Missing release artifact: ${archive}`)
      const tempDir = mkdtempSync(path.join(tmpdir(), 'moying-verify-'))
      const unpackDir = path.join(tempDir, 'contents')
      mkdirSync(unpackDir)
      let mounted = false
      try {
        console.log(`Verifying ${path.basename(archive)}`)
        if (extension === 'dmg') {
          run('/usr/bin/hdiutil', ['verify', archive])
          run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', unpackDir, archive])
          mounted = true
        } else {
          run('/usr/bin/ditto', ['-x', '-k', archive, unpackDir])
        }
        verifyApp(path.join(unpackDir, `${pkg.build.productName}.app`), arch)
      } finally {
        // If detaching fails, stop without recursively deleting a mounted volume.
        if (mounted) run('/usr/bin/hdiutil', ['detach', unpackDir])
        rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }
  console.log('All macOS archives passed signature and architecture checks.')
}

main()
