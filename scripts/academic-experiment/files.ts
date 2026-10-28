/** Frozen local experiment files, separate from live Session state and model execution. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

/** SHA-256 identity for exact exported bytes.
 * @param value File bytes or text.
 * @returns Hex digest.
 */
export function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex') }

/** Create a new output directory without overwriting any existing experiment.
 * @param directory Destination.
 * @returns Absolute new directory.
 */
export function newDirectory(directory: string): string {
  const root = resolve(directory)
  if (existsSync(root)) throw new Error(`Output already exists: ${root}; choose a new experiment name.`)
  mkdirSync(root, { recursive: true })
  return root
}

/** Write a new artifact, retaining a checksum for the export manifest.
 * @param root Existing experiment root.
 * @param name Relative owned filename.
 * @param data Text or JSON-compatible data.
 * @returns Exact byte digest.
 */
export function artifact(root: string, name: string, data: unknown): string {
  const text = typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`
  writeFileSync(resolve(root, name), text, { encoding: 'utf8', flag: 'wx' })
  return digest(text)
}

/** Parse one local JSON object with an explicit object-root check.
 * @param text JSON text.
 * @returns Object-valued JSON; semantic owners validate its contents.
 */
export function objectJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.')
  return value as Record<string, unknown>
}

/** Verify every frozen file before replaying any module.
 * @param directory Export root.
 * @returns Validated manifest and absolute root.
 */
export function verifyBundle(directory: string): { root: string; manifest: Record<string, unknown> } {
  const root = resolve(directory), manifest = objectJson(readFileSync(resolve(root, '实验说明.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'academic-c-experiment') throw new Error('Unsupported experiment schema.')
  if (manifest.files === null || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('Missing file checksums.')
  for (const [name, hash] of Object.entries(manifest.files)) {
    const offset = relative(root, resolve(root, name))
    if (isAbsolute(name) || offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) throw new Error('Artifact path escapes bundle.')
    if (typeof hash !== 'string' || digest(readFileSync(resolve(root, name))) !== hash) throw new Error(`Frozen input changed or damaged: ${name}`)
  }
  return { root, manifest }
}
