---
kind: upgrade-guide
description: Targeted academic coverage uses schema-2 repair state and shared durable budgets.
---

# Targeted academic coverage

English | [中文](guide.zh.md)

## Change

New Controller runs select sources and original passages for approved gaps, supplement at most two existing papers, retain one candidate read and review only affected aspects. Visible plans retain their original questions. `coverageTargeting` freezes character, dispatch, token and elapsed-time limits. Source previews select repairs but never establish evidence or coverage.

Targeted repair states use `schemaVersion: 2` under the existing required coverage event. Older readers refuse this state for executable recovery. The new reader accepts historical schema-1 state only without targeting and retains its frozen algorithm; it never grants a historical run fresh targeted budgets. Existing reports are unchanged.

## Migration

1. Upgrade writers and executable-recovery readers together before starting targeted runs. The Session header version stays unchanged because the repair-state discriminator prevents unsafe recovery.
2. Review Controller `coverageTargeting` defaults: 6,000 source characters, six model calls, 45,000 estimated/reserved tokens and 220 seconds. Preserve their durable reservations across recovery. Token estimation is not an exact provider cap; output and time failures remain explicit.
3. Confirm unresolved questions remain partial after bounded repair. Inspect logged initial and delta review inputs, source locators and verified excerpts. See [workflow behavior](../../../../packages/academic/workflow/README.md).
