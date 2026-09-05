import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync('scripts/verify-macos-release.cjs', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

function harness(failCommand?: string) {
  const calls: { command: string; args: string[] }[] = []
  const removed: string[] = []
  let tempIndex = 0
  const modules: Record<string, unknown> = {
    'node:fs': {
      existsSync: () => true,
      mkdtempSync: () => `/tmp/moying-verify-${tempIndex++}`,
      mkdirSync: vi.fn(),
      rmSync: (target: string) => removed.push(target)
    },
    'node:os': { tmpdir: () => '/tmp' },
    'node:path': path.posix,
    'node:child_process': {
      spawnSync: (command: string, args: string[]) => {
        calls.push({ command, args })
        return { status: command === failCommand ? 1 : 0, stdout: '', stderr: '' }
      }
    },
    '../package.json': pkg
  }
  return {
    calls, removed,
    run: () => vm.runInNewContext(source, {
      require: (name: string) => modules[name],
      __dirname: '/repo/scripts', console: { log: vi.fn() },
      process: { platform: 'darwin', arch: 'arm64', env: {}, stdout: { write: vi.fn() }, stderr: { write: vi.fn() } }
    })
  }
}

describe('macOS release verification', () => {
  it('checks both architectures inside both final archives', () => {
    const h = harness()
    h.run()
    expect(h.calls.filter(c => c.command.endsWith('/codesign') && c.args[0] === '--verify')).toHaveLength(4)
    const lipoCalls = h.calls.filter(c => c.command.endsWith('/lipo'))
    expect(lipoCalls.map(c => c.args[2])).toEqual(['x86_64', 'x86_64', 'arm64', 'arm64'])
    for (const call of lipoCalls) {
      expect(call.args[0]).toContain('/Contents/MacOS/')
      expect(call.args[1]).toBe('-verify_arch')
    }
    expect(h.calls.filter(c => c.args[0] === '-e')).toHaveLength(2)
    expect(h.calls.filter(c => c.args[0] === 'detach')).toHaveLength(2)
    expect(h.removed).toHaveLength(4)
    const extractedZips = h.calls.filter(c => c.command.endsWith('/ditto'))
    expect(extractedZips.map(c => path.posix.basename(c.args[2]))).toEqual([
      `moying-novels-${pkg.version}-x64.zip`, `moying-novels-${pkg.version}-arm64.zip`
    ])
  })

  it('fails immediately when a delivered app has an invalid signature', () => {
    const h = harness('/usr/bin/codesign')
    expect(h.run).toThrow('codesign failed')
    expect(h.calls.some(c => c.command.endsWith('/lipo'))).toBe(false)
    expect(h.removed).toHaveLength(1)
  })

  it('explicitly signs with required runtime entitlements', () => {
    expect(pkg.build.mac.artifactName).toBe('moying-novels-${version}-${arch}.${ext}')
    expect(pkg.build.nsis.artifactName).toBe('moying-novels-${version}-${arch}-Setup.${ext}')
    expect(pkg.build.mac.identity).toBe('-')
    expect(pkg.build.mac.hardenedRuntime).toBe(true)
    expect(pkg.build.mac.strictVerify).toBe(true)
    expect(pkg.build.mac.entitlementsInherit).toBe(pkg.build.mac.entitlements)
    const plist = readFileSync(pkg.build.mac.entitlements, 'utf8')
    expect(plist).toContain('com.apple.security.cs.allow-jit')
    expect(plist).toContain('com.apple.security.cs.disable-library-validation')
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
    expect(lock.version).toBe(pkg.version)
    expect(lock.packages[''].version).toBe(pkg.version)
  })
})
