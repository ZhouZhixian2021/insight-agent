/** Validate OpenAlex JSON and retain bibliography and full-text locations for one content version. */
import type { ExternalIdentifier, WorkVersionType } from '@deepseek-ai/dsh-academic-model'
import { AcademicSourceError, normalizeAcademicCatalogRecord } from '@deepseek-ai/dsh-academic-source'
import type { AcademicSourceWork } from '@deepseek-ai/dsh-academic-source'

type JsonObject = Record<string, unknown>

/** One validated work and its same-version full-text candidates. */
export interface OpenAlexRecord {
  readonly id: string
  readonly work: AcademicSourceWork
  readonly urls: readonly string[]
}

/** Validate a JSON object at the upstream boundary. @param value Upstream JSON. @returns Validated object. */
export function object(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as JsonObject
}

/** Reject malformed upstream responses without echoing response contents or credentials. */
function invalid(): never {
  throw new AcademicSourceError('OpenAlex returned invalid work metadata', 'ACADEMIC_SOURCE_PARSE_ERROR')
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function arxivId(value: unknown): string | undefined {
  const href = publicUrl(value)
  if (href === null) return undefined
  const url = new URL(href)
  if (url.hostname !== 'arxiv.org') return undefined
  const id = url.pathname.replace(/^\/(?:abs|pdf|html)\//u, '').replace(/\.pdf$/u, '')
  return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?$/iu.test(id) ? id : undefined
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !URL.canParse(value)) return null
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  // The web fetcher validates DNS and public destination addresses before downloading.
  return url.href
}

function canonicalPdf(value: unknown): string | null {
  const href = publicUrl(value)
  if (href === null) return null
  const url = new URL(href)
  if (['www.aclweb.org', 'aclweb.org'].includes(url.hostname) && url.pathname.startsWith('/anthology/')) {
    url.hostname = 'aclanthology.org'
    url.pathname = url.pathname.slice('/anthology'.length)
  }
  if (['aclanthology.org', 'proceedings.mlr.press', 'arxiv.org', 'openaccess.thecvf.com'].includes(url.hostname)) {
    url.protocol = 'https:'
  }
  return url.href
}

function aclPdf(doi: string | null): string | null {
  const id = doi?.match(/^10\.18653\/v1\/(.+)$/iu)?.[1]
  if (id === undefined) return null
  const canonical = /^[a-z]\d{2}-\d{4}$/iu.test(id) ? id.toUpperCase() : id
  return /^(?:[A-Z]\d{2}-\d{4}|\d{4}\.[a-z0-9]+-[a-z0-9]+\.[a-z0-9-]+)$/u.test(canonical)
    ? `https://aclanthology.org/${canonical}.pdf` : null
}

/** Official landing pages with a deterministic PDF route; arbitrary HTML is not treated as full text. */
function officialPdf(value: unknown): string | null {
  const href = publicUrl(value)
  if (href === null) return null
  const url = new URL(href)
  if (url.hostname === 'aclanthology.org' && /^\/(?:[A-Z]\d{2}-\d{4}|\d{4}\.[a-z0-9]+-[a-z0-9]+\.[a-z0-9-]+)\/?$/u.test(url.pathname)) {
    return `https://aclanthology.org${url.pathname.replace(/\/$/u, '')}.pdf`
  }
  if (url.hostname === 'openaccess.thecvf.com' && url.pathname.includes('/html/') && url.pathname.endsWith('.html')) {
    url.protocol = 'https:'
    url.pathname = url.pathname.replace('/html/', '/papers/').replace(/\.html$/u, '.pdf')
    url.search = ''
    url.hash = ''
    return url.href
  }
  if (url.hostname === 'proceedings.mlr.press') {
    const match = url.pathname.match(/^\/(v\d+)\/([a-z0-9][a-z0-9_-]*)\.html$/iu)
    if (match !== null) return `https://proceedings.mlr.press/${match[1]}/${match[2]}/${match[2]}.pdf`
  }
  return null
}

/** Normalize one work without substituting preprint bytes for a published version.
 * @param value Upstream OpenAlex work.
 * @returns Validated bibliography and download candidates; unknown first-public dates remain unknown.
 */
export function normalizeOpenAlexWork(value: unknown): OpenAlexRecord {
  const raw = object(value)
  const id = text(raw.id)
  const title = text(raw.title)
  if (id === null || !/^https:\/\/openalex\.org\/W\d+$/u.test(id) || title === null
    || !Array.isArray(raw.authorships) || !Array.isArray(raw.locations)) invalid()
  const authors = raw.authorships.map((entry) => {
    const name = text(object(object(entry).author).display_name)
    if (name === null) invalid()
    return name
  })
  const primary = raw.primary_location === null || raw.primary_location === undefined ? {} : object(raw.primary_location)
  const locations = raw.locations.map(object)
  const doi = text(raw.doi)?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').toLowerCase() ?? null
  const versionType: WorkVersionType = raw.type === 'preprint' && primary.version === 'submittedVersion' ? 'preprint'
    : primary.version === 'publishedVersion' ? 'version_of_record'
      : primary.version === 'acceptedVersion' ? 'accepted_manuscript' : 'unknown'
  const sameVersion = [primary, ...locations].filter(location =>
    versionType === 'preprint' ? location.version === 'submittedVersion'
      : versionType === 'version_of_record' ? location.version === 'publishedVersion'
        : versionType === 'accepted_manuscript' && location.version === 'acceptedVersion')
  const urls = sameVersion.map(location => canonicalPdf(location.pdf_url)).filter(url => url !== null)
  urls.push(...sameVersion.map(location => officialPdf(location.landing_page_url)).filter(url => url !== null))
  if (versionType === 'version_of_record') {
    const acl = aclPdf(doi)
    if (acl !== null) urls.unshift(acl)
  }
  const arxivCandidate = versionType === 'preprint' ? doi?.match(/^10\.48550\/arxiv\.(.+)$/iu)?.[1] : undefined
  const arxiv = arxivCandidate !== undefined
    && /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?$/iu.test(arxivCandidate)
    ? arxivCandidate : undefined
  if (arxiv !== undefined) {
    urls.push(`https://arxiv.org/html/${arxiv}`, `https://arxiv.org/pdf/${arxiv}`)
  }
  // Repository names identify hosting, not the conference or journal of publication.
  const publication = [primary, ...locations].find(location => location.version === 'publishedVersion'
    && (location.source == null || object(location.source).type !== 'repository')
    && (text(location.raw_source_name) !== null
      || (location.source != null && text(object(location.source).display_name) !== null)))
  const source = publication?.source == null ? {} : object(publication.source)
  const base = normalizeAcademicCatalogRecord('openalex', {
    recordId: id, title, authors, doi, year: null,
    venue: text(source.display_name) ?? text(publication?.raw_source_name),
  })
  const identifiers: ExternalIdentifier[] = [...base.academicWork.externalIdentifiers,
    { kind: 'openalex', normalizedValue: id, originalValue: id, sourceProvider: 'openalex' }]
  if (arxiv !== undefined) identifiers.push({ kind: 'arxiv', normalizedValue: arxiv.replace(/v\d+$/u, ''),
    originalValue: arxiv, sourceProvider: 'openalex' })
  const versionIdentifiers = [...identifiers]
  for (const location of [primary, ...locations]) {
    const relatedId = arxivId(location.landing_page_url) ?? arxivId(location.pdf_url)
    if (relatedId === undefined) continue
    const normalizedValue = relatedId.replace(/v\d+$/u, '')
    if (!identifiers.some(identifier => identifier.kind === 'arxiv' && identifier.normalizedValue === normalizedValue)) {
      identifiers.push({ kind: 'arxiv', normalizedValue, originalValue: relatedId, sourceProvider: 'openalex' })
    }
  }
  const date = text(raw.publication_date)
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) invalid()
  const releaseDate = date === null ? { status: 'unknown' as const, reason: 'OpenAlex publication date is missing.' }
    : { status: 'available' as const, value: { iso: date, precision: 'day' as const } }
  return {
    id, urls: [...new Set(urls)],
    work: {
      academicWork: { ...base.academicWork, externalIdentifiers: identifiers,
        firstPublicDate: { status: 'unknown', reason: 'OpenAlex aggregate publication date does not establish the first public release.' },
        publicationStatus: raw.is_retracted === true ? { status: 'available', value: 'retracted' }
          : versionType === 'preprint' ? { status: 'available', value: 'preprint' }
            : versionType === 'version_of_record' ? { status: 'available', value: 'published' }
              : { status: 'unknown', reason: 'OpenAlex does not identify a published or preprint version.' } },
      workVersion: { ...base.workVersion, externalIdentifiers: versionIdentifiers, versionType, releaseDate,
        versionLabel: { status: 'unknown', reason: 'OpenAlex version category does not establish an exact revision; verify against the original source.' },
        status: raw.is_retracted === true ? 'retracted' : 'active' },
    },
  }
}
