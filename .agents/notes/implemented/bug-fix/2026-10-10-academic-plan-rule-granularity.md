# Agent Note: Academic plans separate paper eligibility from collection coverage

Status: implemented

English | [中文](2026-10-10-academic-plan-rule-granularity.zh.md)

## Problem

The Academic workflow applies every approved `inclusionRule` and `exclusionRule` independently to each candidate paper. A generated plan could place a collection-level goal such as “include at least one named benchmark paper” or “cover several domains” in `inclusionRules`. A relevant paper that answered one research question would then be rejected because it could not satisfy the coverage target for the whole collection. A real Q7 run reached full-text processing but admitted no papers for this reason.

## Decision

The Academic planning prompt defines `inclusionRules` and `exclusionRules` as per-paper criteria. Each rule must be decidable from one candidate paper and its verified sources, and every admitted paper must satisfy the applicable rules. Collection-level benchmark, domain, method, and study-type coverage belongs in research questions and linked search directions. Paper counts express collection size, and unmet collection goals are disclosed as coverage gaps and report limitations.

The structured plan schema and runtime filtering semantics remain unchanged. The workflow continues to require every per-paper inclusion rule rather than weakening approved eligibility. The shipped template names the boundary in its readable outline, system-only instructions, and JSON placeholders; the Academic skill repeats the rule at the planning boundary.

## Alternatives considered

**Add a public `portfolioRequirements` field immediately.** Rejected because research questions, linked search directions, evidence counts, and coverage gaps already carry the first required behavior. A new field would require model, Controller, Session, Web, and compatibility migrations before a consumer needs typed collection evaluation.

**Treat partial satisfaction of `inclusionRules` as sufficient.** Rejected because it changes approved eligibility and can admit papers that violate a true per-paper requirement.

**Reject collection language with multilingual keyword matching at runtime.** Rejected because natural-language classification is brittle and would create false positives across topics and languages. The authored prompt, human plan review, and deterministic template regression establish the boundary without inventing an unreliable validator.

## Consequences

- New plans no longer instruct each paper to satisfy the coverage target of the whole evidence set.
- Existing approved plans and stored Sessions remain readable because no public schema or runtime event changes.
- A planning model can still author a poor rule; the readable plan exposes the distinction for review, and a future typed collection requirement remains possible if runtime evaluation is required.
- A keyless snapshot and focused template test detect removal or accidental weakening of the planning rule.

## Testing

`packages/api/academic-research-controller/tests/plan-validation.spec.ts` verifies the per-paper placeholders and collection-goal guidance while retaining compatibility validation. The `academic-plan-chinese` recorded-session snapshot fixes the complete assembled model prompt without requiring a model key.
