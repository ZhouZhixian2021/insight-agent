# Agent Note: Own Academic composition in a business bundle

Status: implemented

English | [中文](2026-11-03-academic-composition-bundle.zh.md)

## Problem

Academic algorithms already occupy dedicated packages, but their provider configuration, browser registration and research preset lived inside the upstream Web bundle. Business changes therefore touched a shared composition file and reuse required discovering several unrelated insertion points.

## Decision

[The Academic bundle](../../../../packages/academic/bundle/README.md) owns the host registrations, browser registration, preset and skill resources. The CLI depends on it and the shipped Web profile selects it after the generic Web layer. The existing profile normalizer migrates only the exact former stock Web tuple; custom lists remain user-owned. Preserved plugin IDs keep later overrides valid. No persisted data shape changes.

## Alternatives considered

**Move every Academic package into one folder without extracting composition.** That alone would leave runtime composition embedded in Web. The [subsequent directory decision](2026-11-04-academic-workspace-group.md) groups the separate packages after this bundle extraction, retaining their package names and build roles.

**Keep a separate Academic patch inside the Web package.** This would reduce one file's size but keep business resources and dependencies owned by upstream Web and provide no independent bundle selection.

**Introduce a new launcher or patch-loading mechanism.** Existing ordered profile bundles already express the required assembly. A second mechanism would add another upstream maintenance surface.

## Consequences

The generic Web bundle no longer owns Academic registrations or dependencies. Default Web behavior retains Academic, while another composition can omit the business layer. Custom profiles must explicitly add it during migration. The module still depends on Harness services, generated Remote types and released Session support; this extraction does not provide framework-independent execution. Composition tests cover selection, omission and exact migration; the existing Loader-based Academic preset test covers model-visible skill loading and plan approval.
