# Agent Note: Q6 preview is an explicit synthetic entry

Status: implemented

English | [中文](2026-10-09-academic-q6-readonly-preview.zh.md)

## Problem

Q6 needs a plan, candidate explanation and coverage page before the complete Remote projection is available. Presenting fixed data inside a real research result could make synthetic candidates appear verified or create an approval action with no server effect.

## Decision

The existing Academic sidebar component exposes a separate, labeled Q6 read-only demo. It opens without a Session and never invokes Remote. Its bundled JSON copy must equal the canonical Q1 fixture in the owner-local test. The component input composes existing shared types; it does not redefine scholarly identities or score rules.

Candidate groups follow producer queue order. Search and priority controls filter presentation only. Scores, thresholds, classifications and reasons remain producer-owned facts. Missing titles and authors are disclosed rather than invented. Unknown metadata and unresolved full text keep their distinct meanings.

Recorded progress snapshots use absolute counts and remain separate from the fixture's independently assessed evidence coverage. A selected snapshot is not a running research operation. The demo displays supplied gaps and stopping reasons but does not generate a replenishment decision.

## Alternatives considered

**Fallback to the fixture when a real request fails.** Rejected because it would conceal errors and misrepresent research results.

**Add simulated approval or priority-edit buttons.** Rejected because these actions have no authoritative execution interface in this delivery.

**Sort by the displayed total score.** Rejected because B's queues already encode diversity and authoritative scheduling order.

## Consequences

The [Q6 interface requirements](../../../../z-team_docs/模块分工/academic-q6-ui-interface-requirements.md) remain a proposal for later real-data integration. The [live progress decision](2026-09-28-academic-progress-client.md) continues to govern real runs; this demo does not replace it. Fixed-data unit tests and a real Web Loader browser scenario verify browsing, filtering, snapshot selection and no research calls. Neither establishes real-source or model quality. Formal Remote integration and candidate adjustments remain separate work.
