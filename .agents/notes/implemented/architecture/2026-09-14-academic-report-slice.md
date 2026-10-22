# Agent Note: Evidence-to-report baseline with explicit semantic review

Status: implemented

English | [中文](2026-09-14-academic-report-slice.zh.md)

## Problem

Shared Claim types do not define analysis behavior or prove semantic support. A fixed-evidence consumer needs a runnable path from traceable records to an inspectable report without inventing a model adapter, search workflow or approval history.

## Decision

The [analysis library](../../../../packages/academic/analysis/README.md) generates attributed method and finding comparisons from at least two independent works. It selects an accepted canonical version, or the sole available version, and refuses ambiguous multiple-version selection. It uses A5 records and immutable evidence snapshots. The [evaluation library](../../../../packages/academic/eval/README.md) checks current identities, references, source depth, coverage and explicit reviewer records; reference integrity alone leaves semantic review pending.

The [report library](../../../../packages/academic/report/README.md) evaluates at its own delivery entry point, exposes draft limitations and refuses unsafe final delivery. The [viewer](../../../../packages/client/ui-academic-research/README.md) creates a self-contained HTML artifact with escaped content, evidence navigation and Markdown download. The standalone renderer owns no Session events; the later fixed-data Web entry is described in the [run viewer decision](2026-09-17-academic-run-viewer.md). The input-preparation decision remains active and is extended, not superseded.

## Alternatives considered

**Generate broad consensus and research gaps from a small fixture.** This treats sample coverage as field coverage. The baseline confines conclusions to attributed source statements and does not rank performance.

**Treat working citations as semantic approval.** Existing references do not prove entailment. Final delivery requires a separately supplied review of the same evidence, while drafts disclose pending review.

**Simulate live research progress without workflow events.** Such progress would imply work and recovery behavior that do not exist. The viewer displays completed report data and quality status only.

## Consequences

The [question-driven synthesis decision](2026-09-20-academic-question-synthesis.md) owns the formal evidence-to-insight stage and preserves this baseline's traceability and independent-review requirements.

The local slice works without network or model credentials. It cannot replace full scholarly analysis, a trusted review service, Session recovery, or workflow integration. The caller remains responsible for truthful synthetic-data disclosure and authentic review provenance. The fixed benchmark is fictional and never qualifies for final publication.

## Testing

The owner-local pipeline tests execute real analysis, evaluation and report code. Viewer tests use recorded pipeline output and execute filtering, evidence expansion and download behavior in jsdom. The downloadable content equals the generated Markdown. Neither these tests nor the HTML artifact claim a live Session integration test.
