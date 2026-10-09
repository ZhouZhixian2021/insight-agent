# Agent Note: Q6 keeps synthetic preview separate from formal run projections

Status: implemented

English | [中文](2026-10-09-academic-q6-readonly-preview.zh.md)

## Problem

Q6 needs one page for plan, candidate explanation, batches and question coverage before and during a real research run. Presenting fixed data inside a real result could make synthetic candidates appear verified, while rebuilding live facts from Session events or a second run could mix identities and repeat work.

## Decision

The existing Academic sidebar component exposes a separate, labeled Q6 read-only demo. It opens without a Session and never invokes Remote. Its bundled JSON copy must equal the canonical Q1 fixture in the owner-local test. The component input composes existing shared types; it does not redefine scholarly identities or score rules.

Ranked execution publishes complete `AcademicQueryWorkflowObservation` snapshots at the Q5 commit points. The Controller's pure `academicQ6Projection()` joins each authoritative evaluation to its exact work, version and reviewed assessment, preserves producer queue order, and exposes plan, rounds, batch decisions and settlements, coverage, stop decisions and limitations. Every projection binds one Session, retrieval run and Brief version and uses a monotonic run-local sequence. Independently produced sections distinguish pending, available empty, truncated and failed states.

`academicResearch.runStream` emits these snapshots as `q6` frames without starting another operation. `AcademicResearchRunValue.q6` retains the latest projection in the terminal response and is `null` only when a legacy selector produced no ranked workflow. The Web client does not parse internal Session events to reconstruct this state. The synthetic sample is never a fallback for a missing or failed real projection.

Candidate groups follow producer queue order. Search and priority controls filter presentation only. Scores, thresholds, classifications and reasons remain producer-owned facts. Missing titles and authors are disclosed rather than invented. Unknown metadata and unresolved full text keep their distinct meanings.

Recorded progress snapshots use absolute counts and remain separate from the fixture's independently assessed evidence coverage. A selected snapshot is not a running research operation. The demo displays supplied gaps and stopping reasons but does not generate a replenishment decision.

## Alternatives considered

**Fallback to the fixture when a real request fails.** Rejected because it would conceal errors and misrepresent research results.

**Add simulated approval or priority-edit buttons.** Rejected because these actions have no authoritative execution interface in this delivery.

**Sort by the displayed total score.** Rejected because B's queues already encode diversity and authoritative scheduling order.

**Attach Q6 fields only to the terminal report.** Rejected because users need to inspect ranking, batches and evidence gaps while the same bounded run is active.

**Send incremental Q6 patches.** Rejected because reconnect gaps and out-of-order delivery would require the client to reproduce server state transitions. Complete snapshots with a sequence use the existing progress replacement rule.

## Consequences

The [Q6 interface requirements](../../../../z-team_docs/模块分工/academic-q6-ui-interface-requirements.md) are fixed for the read-only Remote projection. The [live progress decision](2026-09-28-academic-progress-client.md) continues to govern the six-stage operational view; Q6 adds query-workflow explanation beside it. Fixed-data tests keep the demo isolated, while workflow and Controller tests pin complete observation, projection identity, stream delivery and terminal retention. The Web research form renders `q6` frames and terminal projections in the same request lifecycle. It checks Session/run/Brief identity and increasing Q6 sequences, preserves observed projections on disconnect and ignores late frames after disposal, and distinguishes pending, truncated, failed and empty sections. Per-question support is rendered from settled coverage rather than candidate matches. Candidate-adjustment operations remain separate work.
