# Bound full-text screening and reuse paper sources

English | [中文](academic-fulltext-budget-cache.zh.md)

## Summary

Ranked Academic research reviews scholarly titles and abstracts before downloading selected papers. Independent budgets limit full-text exploration and fragment model calls. A disposable source cache avoids downloading and parsing the same paper for every task, while each task still reviews its own scope and extracts source-verified evidence.

## Table of Contents

- [Admission and budgets](#admission-and-budgets)
- [Source reuse](#source-reuse)
- [Failures and recovery](#failures-and-recovery)
- [Verification](#verification)

<a id="admission-and-budgets"></a>
## Admission and budgets

The workflow discovers and deduplicates records, applies approved hard constraints, ranks candidates, and reviews bounded title/abstract batches. Q5 admits positively reviewed candidates before uncertain candidates. Missing review, unknown relevance and review failure share one exploration allowance. Exhausting that allowance keeps candidates on a waitlist, allowing additional metadata review before another download or a gap search. It does not classify them as irrelevant. Preprint eligibility still follows the approved Brief.

| Controller configuration | Default | Accounting |
|---|---:|---|
| `candidateReviewMaximumWorks` | 24 | Dispatched metadata reviews across all rounds; failures count. |
| `maximumFulltextWorks` | 24 | Distinct scheduled paper versions across the run; failures and cache hits count. |
| `maximumUncertainFulltextWorks` | 2 | Unreviewed, unknown or failed-review papers admitted for exploration; part of the total above. |
| `scopeReviewMaximumBatches` | 3 | Separate scope-review batches per paper. |
| `extractionMaximumCallsPerPaper` | 8 | Evidence-fragment generator attempts per paper, including retries and rejected input attempts. |

Full-text limits never enlarge approved candidate or inclusion limits. A deployment budget below the approved target produces an explicit limitation. The workflow preserves that target and the approved insufficient-evidence policy. Zero uncertain exploration requires positive metadata review. Fragment reading reuses approved question aliases and existing lexical prioritization; a match only selects text to read. No match or no extracted fact establishes neither irrelevance nor absence of a finding. This change preserves the five-record minimal evidence limit.

<a id="source-reuse"></a>
## Source reuse

The shipped Web composition selects `fulltextCacheDirectory` under DSH home's `cache/academic-fulltext`. Other compositions must supply a directory to enable caching. The cache stores raw HTML/PDF plus parsed text, source hash and paragraph/page locators. Keys include source records, scholarly version type and label, identifiers, provider and candidate URL; generated task identities and research questions are not keys. Each hit binds the source to current task identities, questions and extraction settings, retaining the original acquisition timestamp.

| Cache configuration | Default |
|---|---:|
| `fulltextCacheMaximumAgeMs` | 86,400,000 ms |
| `fulltextCacheMaximumBytes` | 268,435,456 bytes |
| `fulltextCacheMaximumEntryBytes` | 33,554,432 bytes |

Each serialized entry includes raw and parsed checksums. A parser-generation mismatch rebuilds parsed text from raw bytes. Maintainers must change the parser generation in `fulltext-cache.ts` whenever parser behavior or locator semantics change. Expired entries, raw corruption, version changes and known source-hash mismatches cause fresh acquisition. Parsed-checksum corruption permits reparsing valid raw bytes. Writes replace files atomically and remove the oldest written entries until total retained bytes fit. Oversized entries are processed without caching. Source changes at an unchanged URL become visible on expiry; freshness is bounded, not continuously revalidated.

Only source material is reusable. Candidate relevance, inclusion, question coverage, evidence IDs and report conclusions are recomputed for every Brief. The first cache miss still downloads and parses a complete source, including the full PDF; the fragment budget reduces model reading, not that initial download. No vector database is introduced. Post-draft enhancement uses the same cache and still requires the original evidence hash.

<a id="failures-and-recovery"></a>
## Failures and recovery

Failed, truncated and unsupported bodies do not enter the cache. Invalid cache records and disk failures emit warnings and fall back to source acquisition or retain the valid source already acquired. Cancellation checks stop dependent work. Every dispatched model request continues through the existing durable Session logger; cached source text does not bypass exact excerpt verification.

Checkpoints optionally store `policy.fulltext`. New runs reconstruct consumed work and exploration slots from saved scheduled identities and metadata assessments. A pending batch retains its original scheduling charge; completed batches are not scheduled again. Older checkpoints omit the optional policy and keep their original scheduling interpretation. Extraction-call limits apply to each execution of a paper; interrupted paper extraction is retried under the existing recovery behavior. Clearing the disposable cache does not alter Session evidence or approved research requirements.

<a id="verification"></a>
## Verification

Focused cases cover confirmed-before-uncertain admission, zero exploration, exhausted work budgets, continued waitlist review, cross-task identity rebinding, parser invalidation, expiry, corruption, cancellation and bounded disk bytes. The existing current-policy SDK Session fixture records source reuse without network access. These deterministic checks measure requests and retained data, not real-model latency or literature recall.

## Dev Note

The default budgets are finite operating defaults, not measurements of optimal research quality. Calibrate them for the intended inclusion target and source length. Evidence-depth expansion remains separate work.
