/** Discover browser feature packages independently of their workspace group. */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Identify packages governed by the browser feature rules.
 * @param manifest - Repository-relative manifest path with either separator.
 * @param name - Declared package name.
 * @returns Whether the package has a UI feature identity or occupies the Client group.
 */
export function isClientFeaturePackage(manifest: string, name: string): boolean {
  return manifest.replaceAll('\\', '/').startsWith('packages/client/')
    || name.startsWith('@deepseek-ai/dsh-client-ui-')
}

/**
 * Find Client feature manifests, including features grouped with their business.
 * @param root - Absolute repository root.
 * @returns Sorted, normalized manifest paths; Host wire exports are excluded.
 */
export function clientFeatureManifestPaths(root: string): string[] {
  return globSync('packages/*/*/package.json', { cwd: root })
    .map(file => file.replaceAll('\\', '/'))
    .filter((file) => {
      const manifest: unknown = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
      const name = typeof manifest === 'object' && manifest !== null && 'name' in manifest
        && typeof manifest.name === 'string' ? manifest.name : ''
      return isClientFeaturePackage(file, name)
    })
    .sort()
}
