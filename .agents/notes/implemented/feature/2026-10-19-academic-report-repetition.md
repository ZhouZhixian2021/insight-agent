# Agent Note: Academic report paragraph reuse

Status: implemented

English | [中文](2026-10-19-academic-report-repetition.zh.md)

## Problem

A validated statement can appear in several direction components and question answers. Expanding every placement duplicates the same analysis and conditions. An appendix ordered by incoming evidence records exposes internal ordering instead of a readable paper list.

## Decision

The first placement expands a statement with an anchor, scope, uncertainty and supporting, opposing or background evidence. Later placements link to that paragraph. Executive insight uses the same identity registry; quantitative tables link to the paragraph and retain experimental conditions and source locators. Distinct statements are not merged by text similarity. Analytical length counts each expanded statement once.

The appendix sorts paper groups by title using an explicit Chinese locale, with work identity breaking ties. Each group retains its existing bibliography number and sorts versions by identity; records retain input order within a version. Evidence identifiers, excerpts and locators remain unchanged. Missing titles use work identity for display. Rendering does not mutate producer records or change review status.

## Alternatives considered

Repeating full text makes sections independently readable but inflates a small set of findings. Removing similar-looking text could merge distinct claims. Generating shorter replacement conclusions in the renderer would introduce unverified analysis.

## Consequences

Readers follow cross-references for shared arguments. The first placement is determined by report traversal, not a new semantic classifier. Appendix order does not renumber citations. No model, Remote, shared type or workflow change is required.

## Verification

Report fixtures assert one textual occurrence per shared statement, valid paragraph references, unchanged inputs and title-grouped evidence despite reversed record order. Package-owned expected reports record the output.
