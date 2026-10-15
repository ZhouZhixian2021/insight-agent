# Agent Note: Minimal evidence shares source verification with complete extraction

Status: implemented

English | [中文](2026-10-14-academic-minimal-evidence-depth.zh.md)

## Problem

Producing a traceable draft does not require every paper to populate a complete evidence card. A per-call record cap cannot bound a paper processed through multiple fragments, and unlinked excerpts cannot establish coverage of approved questions.

## Decision

The evidence library accepts `depth: 'minimal'` on its existing extraction input. Minimal extraction requires approved focus questions, verifies each draft's question indexes and exact excerpt independently, and retains at most five records. Complete extraction remains available through the same entry points. Both depths return existing records, locators, question links and six-section cards; empty sections do not establish full review.

Fragment extraction enforces the paper cap after source-overlap deduplication and before the caller's verified-result sink. The retained evidence identities also select locators, question links and card references. Reaching the cap stops dispatch and returns unprocessed ranges as incomplete, separately from model failures. Recoverable fragment failures preserve verified siblings; cancellation, unclassified failures and persistence failures reject the operation.

Expected draft validation failures return rejection values, without catching unrelated exceptions. Model-authored segment and question indexes remain checked. Private fragment indexes come from the validated source packer and its own splits; those lookups and non-empty commits rely on their construction rather than accepting fabricated same-process ranges. Exact-quote repair likewise uses the sole match only after counting it.

The [scope/extraction separation](2026-10-11-academic-paper-screening-evidence-phases.md) remains independently useful: admission, model routing, durable requests and report eligibility belong to the workflow. The [question-focused reading decision](2026-10-12-academic-question-evidence-reading.md) continues to own semantic analysis and independent review. Neither decision is superseded by selecting minimal extraction. No shared Academic Model or Session schema changes.

## Alternatives considered

**Create a separate minimal evidence record or extractor.** Rejected because existing source locators, records and question links express the required facts; a second verifier would duplicate provenance and quote validation.

**Trim the final assembled result only.** Rejected because the verified-result sink could persist more than five records and retain card references missing from the returned result.

**Require complete cards or infer coverage from the evidence count.** Rejected because valid excerpts can answer only one of several approved questions. The caller derives uncovered questions from missing question links and decides whether a limited draft is allowed.

## Consequences

The Controller selects minimal depth for formal research runs; lower-level callers that omit the depth policy retain complete extraction. The workflow treats a clean five-record cap as an intentional stop, while fragment failures and rejected drafts remain visible. The path bounds retained evidence without certifying semantic support or formal delivery. [Fragment priority and recovery](2026-10-14-academic-fragment-priority-recovery.md) owns minimal reading order and smaller-input recovery; enhancement and real-model performance calibration remain separate work.

## Verification

Owner-local tests cover question-link rejection, quote rejection, the direct and paper-wide caps, retained identities at the sink, incomplete retry siblings and the fixed A-PE1 timeout handoff. Workflow model tests cover the formal minimal request, durable verified fragment, paper cap and clean-stop status. Existing extraction and fragment tests cover cancellation, sink failure and complete extraction. No real-model latency improvement is asserted.
