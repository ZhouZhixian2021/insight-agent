# Agent Note: Concise Academic review plan with complete execution data

Status: implemented

English | [中文](2026-10-14-academic-concise-review-plan.zh.md)

## Problem

An ordinary research question could produce an approval plan dominated by internal search terms, provider choices, limits, and a field-by-field Research Brief. Users had to read execution details to approve research intent.

## Decision

The Academic preset writes a concise Simplified Chinese review body, aiming for 300–600 Chinese characters. It presents the goal, three to five research questions, scope, four to five execution steps, deliverable, and material choices requiring user confirmation. The scope states consequential decisions such as date basis, accepted paper versions, evidence level, and approximate paper count. The deliverable states the evidence-shortage behavior. Exact queries, screening terms, provider lists, independent minimums and limits, and enum values remain in the existing `academic-research-brief-json` block under “系统执行信息”.

The block keeps its schema, complete fields, and position in the `exit_plan_mode` plan argument. Its consequential decisions agree with the readable body. Natural-language revisions update both parts. The Controller continues to validate and execute the approved block; this decision changes authoring instructions rather than the approved-plan parser or persistence format.

## Alternatives considered

Removing the structured block would break the existing reviewed handoff. Repeating every execution field in prose would preserve detail but retain the approval burden. The concise body preserves user decisions while the structured block remains inspectable.

## Consequences

The preset and Research Brief template no longer direct the model to list every retrieval provider and budget in the readable plan. A user-specified source restriction still appears there. The [approved-plan search decision](2026-09-21-academic-approved-plan-search.md) continues to own query generation and execution policy. The Web approval card's default folding of system information belongs to the client work package; this prompt change alone does not provide that UI behavior.

## Verification

The fixed A-PE1 plan provides an executable concise-body example. Controller plan-validation tests check the template's unchanged structured payload and the fixed plan's reviewed choices. Preset composition tests check the shipped planning instruction. Real-model plan quality remains to be checked during joint acceptance.
