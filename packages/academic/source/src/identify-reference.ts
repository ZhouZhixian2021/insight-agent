/** Identify paper references in one Web search source without trusting its metadata. */
import type {
  AcademicReference,
  AcademicReferenceIdentificationIssue,
  AcademicReferenceIdentificationResult,
  AcademicWebDiscoveryCandidate,
} from './types.ts'

const DOI = /(?<![a-z0-9])10\.\d{4,9}\/[-._;()/:a-z0-9]+/giu
const ARXIV_ID = String.raw`(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?/\d{7})(?:v\d+)?`
const ARXIV_VALUE = new RegExp(`^${ARXIV_ID}$`, 'iu')
const ARXIV_PATH = new RegExp(`^/(?:abs|pdf)/(${ARXIV_ID})(?:\\.pdf)?/?$`, 'iu')
const ARXIV_LABEL = new RegExp(`\\barXiv:\\s*(${ARXIV_ID})(?![a-z0-9])`, 'giu')
const ACL_ID = /^(?:\d{4}\.[a-z0-9]+-[a-z0-9]+(?:\.[a-z0-9-]+)+|[A-Z]\d{2}-\d{4}(?:v\d+)?)$/u
const PMLR_PAGE = /^\/(v\d+)\/([a-z0-9][a-z0-9._-]*)\.html$/u
const PMLR_PDF = /^\/(v\d+)\/([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._-]*)\.pdf$/u
const CVF_PAGE = /^\/content(?:\/[^/]+(?:\/[^/]+)?|_[^/]+)\/html\/[^/]+_paper\.html$/u
const CVF_PDF = /^\/content(?:\/[^/]+(?:\/[^/]+)?|_[^/]+)\/papers\/[^/]+_paper\.pdf$/u
const ARXIV_NUMERIC_LABEL = /\barxiv(?:\s+(?:identifier|id))?\s*:?\s*(\d[\w./-]*)/giu

/**
 * Extract DOI, arXiv, ACL, PMLR, and CVF references from one Web source.
 * Identification makes no network request and does not verify that a paper exists.
 * A discarded candidate carries an explicit issue; valid references survive sibling issues.
 * @param candidate - one untrusted Web search source.
 * @returns Distinct references with the original discovery URL and identification issues.
 */
export function identifyAcademicReferences(candidate: AcademicWebDiscoveryCandidate): AcademicReferenceIdentificationResult {
  let url: URL
  try {
    url = new URL(candidate.url)
  } catch {
    return { status: 'discarded', references: [],
      issues: [{ code: 'invalid_reference', message: 'The Web result URL is invalid.' }] }
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return { status: 'discarded', references: [],
      issues: [{ code: 'invalid_reference', message: 'The Web result URL is invalid.' }] }
  }

  const references: AcademicReference[] = []
  const issues: AcademicReferenceIdentificationIssue[] = []
  const seen = new Set<string>()
  const add = (key: string, reference: AcademicReference): void => {
    if (seen.has(key)) return
    seen.add(key)
    references.push(reference)
  }
  const discoveryUrl = candidate.url
  const providerRecord = (provider: 'acl' | 'pmlr' | 'cvf', recordId: string): void => {
    add(`${provider}:${recordId}`, { kind: 'provider_record', provider, recordId, discoveryUrl })
  }

  if (url.hostname === 'arxiv.org') {
    const id = url.pathname.match(ARXIV_PATH)?.[1]
    if (id !== undefined) add(`arxiv:${id.toLowerCase()}`, {
      kind: 'arxiv', normalizedValue: id, originalValue: id, discoveryUrl,
    })
    else if (/^\/(?:abs|pdf)\//u.test(url.pathname)) {
      issues.push({ code: 'invalid_reference', message: 'The arXiv URL has an invalid paper identifier.' })
    }
  } else if (url.hostname === 'aclanthology.org') {
    const id = url.pathname.replace(/^\//u, '').replace(/\/$/u, '').replace(/\.pdf$/u, '')
    if (ACL_ID.test(id)) providerRecord('acl', id)
  } else if (url.hostname === 'proceedings.mlr.press') {
    const page = url.pathname.match(PMLR_PAGE)
    const pdf = url.pathname.match(PMLR_PDF)
    if (page !== null) providerRecord('pmlr', `${page[1]}/${page[2]}`)
    else if (pdf !== null && pdf[2] === pdf[3]) providerRecord('pmlr', `${pdf[1]}/${pdf[2]}`)
  } else if (url.hostname === 'openaccess.thecvf.com') {
    if (CVF_PAGE.test(url.pathname) || CVF_PDF.test(url.pathname)) {
      const page = new URL(url.href)
      page.protocol = 'https:'
      page.pathname = page.pathname.replace('/papers/', '/html/').replace(/\.pdf$/u, '.html')
      page.search = ''
      page.hash = ''
      providerRecord('cvf', page.href)
    }
  }

  let decodedUrl: string
  try {
    decodedUrl = decodeURIComponent(candidate.url)
  } catch {
    decodedUrl = candidate.url
  }
  const sources = [decodedUrl, candidate.title ?? '', candidate.snippet ?? '']
  const dois = new Map<string, string>()
  const urlDois = new Set<string>()
  for (const [index, source] of sources.entries()) {
    for (const match of source.matchAll(DOI)) {
      let originalValue = match[0].replace(/[.,;:]+$/u, '')
      while (originalValue.endsWith(')')
        && originalValue.split(')').length > originalValue.split('(').length) {
        originalValue = originalValue.slice(0, -1)
      }
      const normalizedValue = originalValue.toLowerCase()
      dois.set(normalizedValue, dois.get(normalizedValue) ?? originalValue)
      if (index === 0) urlDois.add(normalizedValue)
    }
    for (const match of source.matchAll(ARXIV_LABEL)) {
      const id = match[1] as string
      add(`arxiv:${id.toLowerCase()}`, { kind: 'arxiv', normalizedValue: id, originalValue: id, discoveryUrl })
    }
  }
  if (dois.size > 1) {
    issues.push({ code: 'ambiguous_reference', message: 'The Web result does not identify which DOI belongs to the paper.' })
  }
  for (const [normalizedValue, originalValue] of dois) {
    if (dois.size > 1 && !(url.hostname === 'doi.org' && urlDois.size === 1 && urlDois.has(normalizedValue))) continue
    add(`doi:${normalizedValue}`, { kind: 'doi', normalizedValue, originalValue, discoveryUrl })
  }
  if (url.hostname === 'doi.org' && dois.size === 0 && /^\/10\./u.test(url.pathname)) {
    issues.push({ code: 'invalid_reference', message: 'The DOI is incomplete.' })
  }
  for (const [index, source] of sources.entries()) {
    for (const match of source.matchAll(ARXIV_NUMERIC_LABEL)) {
      const id = (match[1] as string).replace(/[.,;:]+$/u, '')
      if (ARXIV_VALUE.test(id)) {
        add(`arxiv:${id.toLowerCase()}`, { kind: 'arxiv', normalizedValue: id, originalValue: id, discoveryUrl })
      } else {
        const location = index === 2 ? 'snippet' : index === 1 ? 'title' : 'URL'
        issues.push({ code: 'invalid_reference', message: `The arXiv identifier in the ${location} is incomplete.` })
      }
    }
  }
  const [first, ...rest] = references
  if (first !== undefined) return { status: 'identified', references: [first, ...rest], issues }
  const [firstIssue, ...otherIssues] = issues
  return { status: 'discarded', references: [], issues: firstIssue === undefined
    ? [{ code: 'unrecognized_page', message: 'The Web result contains no supported paper reference.' }]
    : [firstIssue, ...otherIssues] }
}
