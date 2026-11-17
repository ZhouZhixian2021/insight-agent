/**
 * The markdown renderer's two mdast grammars, one per rendering arm. Each
 * arm is internally consistent — the incremental tail parses, the one-shot
 * parses, and the plain-text projection of a given grammar always agree on
 * where blocks start and end — and the settled grammar is the streaming one
 * plus the math extensions, so the arms differ only where TeX delimiters
 * begin a math construct (a `$$` block is a paragraph while streaming and a
 * math block once settled, by design).
 */

import type { Parent, Root, Text } from 'mdast'
import { recoverLocalImages } from './local-image-syntax.ts'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'
import { cjkFriendlyStrong } from './cjkFriendlyStrong.ts'
import { mathCompatibility } from './mathCompatibility.ts'

/** Keep prose punctuation outside GFM's bare-URL links; explicit Markdown links retain their destinations. */
function delimitBareLinks(root: Root, source: string): Root {
  const visit = (parent: Parent): void => {
    for (const [index, node] of parent.children.entries()) {
      if (node.type === 'link') {
        const link = node
        const raw = link.position === undefined ? undefined
          : source.slice(link.position.start.offset, link.position.end.offset)
        const label = link.children.length === 1 && link.children[0]?.type === 'text' ? link.children[0].value : undefined
        // GFM's text-to-autolink transform produces unpositioned links; explicit links have positions.
        const bare = raw === undefined ? label !== undefined
          && (link.url === label || link.url === `http://${label}`)
          : /^(?:www\.|https?:\/\/)/iu.test(raw)
        if (label !== undefined && bare && /^(?:www\.|https?:\/\/)/iu.test(label)) {
          const boundary = label.search(/[、，。；！？（）【】]/u)
          if (boundary > 0) {
            const prefix = label.slice(0, boundary)
            link.url = /^www\./iu.test(prefix) ? `http://${prefix}` : prefix
            link.children = [{ type: 'text', value: prefix }]
            const suffix: Text = { type: 'text', value: label.slice(boundary) }
            parent.children.splice(index + 1, 0, suffix)
          }
        }
      }
      if ('children' in node && Array.isArray(node.children)) visit(node)
    }
  }
  visit(root)
  return root
}

/**
 * Parse GFM markdown (the streaming arm's grammar: no math, so incomplete
 * TeX never flashes KaTeX errors mid-stream).
 * @param text - Markdown source.
 * @returns The mdast root.
 */
export function parseGfm(text: string): Root {
  return delimitBareLinks(recoverLocalImages(fromMarkdown(text, {
    extensions: [gfm(), cjkFriendlyStrong()],
    mdastExtensions: [gfmFromMarkdown()],
  }), text), text)
}

/**
 * Parse GFM markdown plus TeX math with the compatibility delimiters
 * (the settled arm's grammar).
 * @param text - Markdown source.
 * @returns The mdast root.
 */
export function parseGfmWithMath(text: string): Root {
  return delimitBareLinks(recoverLocalImages(fromMarkdown(text, {
    extensions: [gfm(), cjkFriendlyStrong(), mathCompatibility(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  }), text), text)
}
