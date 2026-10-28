/** Local source snapshots make uncommitted C-module experiments identifiable. */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { artifact, digest } from './files.ts'

/** Save exact C source text and hashes without copying credentials or runtime data.
 * @param output New experiment directory.
 * @returns Git revision, worktree state and source digest.
 */
export function captureCode(output: string) {
  const repository = resolve(import.meta.dirname, '../..')
  const files: Record<string, { sha256: string; text: string }> = {}
  for (const folder of ['packages/academic/analysis/src', 'packages/academic/eval/src', 'packages/academic/report/src',
    'packages/client/ui-academic-research/src']) {
    for (const entry of readdirSync(resolve(repository, folder), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:ts|tsx|css)$/u.test(entry.name)) continue
      const file = resolve(entry.parentPath, entry.name), text = readFileSync(file, 'utf8')
      files[relative(repository, file).replaceAll('\\', '/')] = { sha256: digest(text), text }
    }
  }
  const sourceSha256 = artifact(output, '代码快照.json', files)
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    worktreeDirty: execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim() !== '', sourceSha256 }
}
