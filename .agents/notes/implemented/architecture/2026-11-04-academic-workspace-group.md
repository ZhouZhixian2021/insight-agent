# Agent Note: Group Academic packages without collapsing their build roles

Status: implemented

English | [中文](2026-11-04-academic-workspace-group.zh.md)

## Problem

Academic reuse requires locating business packages, a backend controller, a browser feature, and a composition bundle across four workspace groups. Their shared business ownership is difficult to discover, while moving files without updating discovery would silently remove browser code from repository checks.

## Decision

Academic approval rendering and preset copy live in `ui-research`; `client-remote` mounts its generated browser API. Shared question controls expose a business-content chain slot and retain answer settlement. Shared preset views expose an instance-owned display registry with localized values and disposal. Keeping Academic branches in those shared views or in common Remotes would restore the coupling this grouping removes; embedding a second transport in Academic would duplicate Gateway lifecycle behavior.

[The academic group](../../../../packages/academic/README.md) owns all four roles as separate packages. The backend lives in `research-controller`, the browser feature in `ui-research`, and composition in `bundle`. Public package names, exports, plugin IDs, and persisted event formats remain stable. The two-level workspace layout and separate Host and Client compiler references remain intact; browser bundling continues through the shared Client preset.

This revises the directory alternative in the [composition-bundle decision](2026-11-03-academic-composition-bundle.md), while retaining that decision's independent bundle. Client checks discover relocated features by their existing package identity as well as the original Client group. Host packages exposing typed browser wire contracts retain their existing classification.

## Alternatives considered

**Keep the four workspace groups.** This preserves location-based discovery but makes business handoff and source reuse depend on a separate list of directories.

**Merge all roles into one package.** This removes useful dependency and compiler boundaries. A browser consumer would inherit backend concerns, and individual capabilities would become harder to reuse.

**Add directory links instead of moving the packages.** Links leave the source ownership scattered and make a copied directory depend on external targets, particularly across Windows workspaces.

## Consequences

Academic-specific source, tests, package documentation, and composition resources share one group. Framework services, released Session migration generations, repository experiment scripts, and application-level tests stay with their existing owners. Complete reuse still requires matching Harness dependencies and profile composition. Upstream updates retain integration points in the CLI, generated remotes, build references, and check discovery; this layout reduces business scattering without promising conflict-free upgrades.

Verification covers relocation-aware browser discovery, retained Client restrictions, package compilation, the moved tests, and the existing Loader-based Academic preset scenario. No architecture drawing is edited by this change.
