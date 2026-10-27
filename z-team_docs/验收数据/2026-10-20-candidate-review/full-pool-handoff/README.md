# Complete retained candidate-pool handoff

English | [中文](README.zh.md)

## Purpose and scope

B/C can inspect all 276 retained deduplicated works, trace historical dispatch, and replay the current selector without a model, Web service or local Session directory. Start with the [readable candidate list](candidates.md); use the [per-work audit](audit.json) for identities, filter reasons, scores, routing and request references.

The source is the 2026-10-19 Agentic AI study, Session `session-aad43ed3-e716-4a7e-a300-61a8351b6cfe`. Canonical metadata, identities and Plan agree with the existing [eight-paper scoring handoff](../scoring-handoff/README.md). Canonical abstracts and keywords come from the saved checkpoint, not Web snippets or another version.

## Counts and interpretation

| Observation or offline result | Count | Meaning |
| --- | --- | --- |
| Historical discovery count | 463 | Recorded aggregate count; individual raw responses are not included. |
| Retained deduplicated pool / versions | 276 / 286 | All retained work and version identities are preserved. |
| Scholarly abstract available / unknown | 271 / 5 | Missing abstracts remain unknown. |
| Offline hard exclusions | 30 | Specific reasons remain attached to each work. |
| Offline unresolved full-text addresses | 23 | Address resolution does not establish whether a PDF can be downloaded. |
| Candidates after hard filtering and address checks | 223 | Eight selected; 215 not selected under the review budget. |
| Actual historical requests / valid results | 8 / 3 | Legacy calls on 2026-10-19; distinct from the later Pro/Flash eight-paper rechecks. |

The historical post-review queues contain P0=0, P1=1, P2=13 and excluded=262. Current code reconstructs pre-review lexical queues with P0=0, P1=0, P2=14 and excluded=262. Queue exclusion includes a score below P2, so 262 is not the hard-exclusion count. The selector may review a hard-eligible work below the queue threshold; “not selected” is not a semantic rejection.

With budget eight and no prior attempts, the current selector chooses the same eight work IDs as the actual historical requests, in a different order. The first three choices cover all five routed questions; routed selected-work counts are 4/6/3/2/3. This is routing coverage, not evidence support or proof that omitted papers are irrelevant. This pool demonstrates no replacement or membership improvement.

## Files and provenance

| File | Contents |
| --- | --- |
| [input.json](input.json) | Same-version approved Brief/Plan, screening concepts, 276 canonical records, all 286 version identities, scholarly metadata, query provenance and address-availability facts. |
| [historical.json](historical.json) | Actual checkpoint assessments and ranking, 14 processing candidates with saved URLs, search summary, eight request/result references and batch decisions. No model streams or credentials. |
| [replay.json](replay.json) | Current pure-function screening, all lexical scores/queues and 276 selector decisions; explicitly labelled offline reconstruction. |
| [audit.json](audit.json) | Counts, old/new selection order, routed-question coverage and one joined row per work. Independent relevance labels are not supplied. |
| [candidates.md](candidates.md) | Human-readable index of all 276 works, linked by canonical identity. |
| [manifest.json](manifest.json) | Source Session hash, checkpoint/event references, code revision, file hashes and explicit missing-material flags. |

The first checkpoint is event 150, after legacy review. Recorded assessments retain its post-review state; the replay uses only canonical metadata, approved inputs and address facts, without injecting recorded model judgments. No historical pre-review ranking is invented. The source predates the versioned selection event; historical dispatch order comes from request events 114–142, while the new selection and reasons are a current-code reconstruction.

## Replay

After installing repository dependencies, run from the repository root:

```powershell
pnpm exec vitest run packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts
```

Three focused checks validate identities/metadata and linkage to the eight-paper package; reproduce assessments, ranking and every selection decision; and reconcile actual dispatch with offline selection. They read committed files and call production pure functions only. No search, download, model request or Session write handle is required.

## Limits and ownership

“Complete” means the entire retained deduplicated pool, not all 463 raw discovery responses or all literature. Provider truncation, raw-response deduplication history and metadata for ten noncanonical versions cannot be recovered from this package. Concrete URLs are retained for 14 processing candidates; the other resolvable flags are historical address facts, not downloadable files supplied by this package.

- **B:** inspect selection and queue decisions across the full pool, including budget-skipped works. Preserve approved weights and thresholds; use the recorded eight-paper scoring review for score attribution.
- **C:** independently label relevance and possible omissions, prioritizing the three Pro/Flash disagreements. Inspect missing abstracts, misleading term matches and hard exclusions. Neither a quoted judgment nor routed coverage is a quality oracle.
- **A:** provide these traceable inputs and handle confirmed prompt/call/Session wiring issues. B’s merged scoring review identifies no algorithm defect; this export makes no production behavior change and adds no model calls.

The [team plan](../../../模块分工/academic-candidate-semantic-review-optimization-team-plan.md) tracks quality, per-work UI states, downstream report regression and final joint acceptance separately. No independent omission or end-to-end quality pass is claimed by this handoff.
