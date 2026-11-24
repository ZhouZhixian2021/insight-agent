/** Read an operator-selected style example separately from the investigation's citable sources. */
import { addAbortListener } from 'node:events'
import { createReadStream, type BigIntStats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OfficeSourceKey, OfficeToPdf } from '@deepseek-ai/dsh-office-to-pdf'

interface ReferencePage {
  width: number
  height: number
  /** Text in reading order. Each line starts with its left offset, baseline and text height in PDF points. */
  lines: { left: number; baseline: number; height: number; text: string }[]
}

/** The example has no evidence ID, source URL or entry in the report bibliography. */
export type ProductWritingReference =
  | { fileName: string; format: 'html'; content: string }
  | { fileName: string; format: 'doc' | 'docx' | 'pdf'; pages: ReferencePage[] }

function fileVersion(info: BigIntStats): string {
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':')
}

/** Read all physical pages; preserve blank pages, line positions and heading sizes. */
async function readPdfPages(bytes: Uint8Array, signal?: AbortSignal): Promise<ReferencePage[]> {
  const { getDocument, VerbosityLevel } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  signal?.throwIfAborted()
  const assetDir = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'))).replaceAll('\\', '/')
  const task = getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, useWorkerFetch: false,
    cMapUrl: assetDir + '/cmaps/', cMapPacked: true, standardFontDataUrl: assetDir + '/standard_fonts/',
    verbosity: VerbosityLevel.ERRORS })
  let closing: Promise<void> | undefined
  const close = () => closing ??= task.destroy()
  const listener = signal && addAbortListener(signal, () => { void close().catch(() => {}) })
  try {
    const document = await task.promise
    const pages: ReferencePage[] = []
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted()
      const page = await document.getPage(number)
      const { width, height } = page.getViewport({ scale: 1 })
      const { items } = await page.getTextContent()
      const lines: ReferencePage['lines'] = []
      let line: ReferencePage['lines'][number] | undefined
      for (const item of items) {
        if (!('str' in item)) continue
        if (!line && item.str) {
          line = { left: Math.round(item.transform[4]), baseline: Math.round(item.transform[5]),
            height: Math.round(item.height), text: '' }
          lines.push(line)
        }
        if (line) line.text += item.str
        if (item.hasEOL) line = undefined
      }
      pages.push({ width: Math.round(width), height: Math.round(height), lines })
      page.cleanup()
    }
    if (!pages.some(page => page.lines.some(line => line.text.trim()))) {
      throw new Error('写作样稿没有可读取的文字，请先对扫描件做 OCR，或选择带文字层的文件。')
    }
    return pages
  } finally {
    listener?.[Symbol.dispose]()
    await close()
  }
}

/**
 * Load the complete packaged HTML or a trusted plugin configuration path once per writing run.
 * @param configuredFile - Absolute path or filename relative to the package references directory.
 * @param office - The Host's Office converter, used only for DOC and DOCX.
 * @param signal - Cancels reading, queued conversion and PDF extraction.
 * @returns The example as inert model input, including the original HTML or every page of selectable text.
 */
export async function readProductWritingReference(configuredFile?: string, office?: Pick<OfficeToPdf, 'convert'>,
  signal?: AbortSignal): Promise<ProductWritingReference> {
  const manifest = import.meta.resolve('@deepseek-ai/dsh-product-insight-workflow/package.json')
  const file = resolve(fileURLToPath(new URL('./references/', manifest)), configuredFile ?? 'm6-report.html')
  const fileName = basename(file)
  const format = extname(file).slice(1).toLowerCase()
  signal?.throwIfAborted()
  try {
    if (format === 'html' || format === 'htm') {
      const bytes = await readFile(file, { signal })
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (!content.trim()) throw new Error('HTML 写作样稿为空。')
      return { fileName, format: 'html', content }
    }
    if (format === 'pdf') return { fileName, format, pages: await readPdfPages(await readFile(file, { signal }), signal) }
    if (format !== 'docx' && format !== 'doc') throw new Error('请选择 HTML、PDF、DOCX 或 DOC 文件。')
    if (!office) throw new Error('读取 Word 样稿需要启用 DSH 的 office-to-pdf 服务，也可以选用 PDF 或 HTML。')
    const info = await stat(file, { bigint: true })
    if (!info.isFile()) throw new Error('样稿路径必须指向文件。')
    const converted = await office.convert({ extension: format, priority: 'foreground', source: {
      key: brandString<OfficeSourceKey>(JSON.stringify(['product-writing-reference', file])),
      version: fileVersion(info), bytes: Number(info.size),
      read: async (upstream, maxBytes) => {
        const bytes = await buffer(createReadStream(file, { signal: upstream, start: 0, end: maxBytes }))
        const version = fileVersion(await stat(file, { bigint: true }))
        return { bytes, version }
      },
    } }, signal)
    return { fileName, format, pages: await readPdfPages(converted.pdf, signal) }
  } catch (cause) {
    signal?.throwIfAborted()
    throw new Error(`无法读取写作参考报告「${fileName}」：${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  }
}
