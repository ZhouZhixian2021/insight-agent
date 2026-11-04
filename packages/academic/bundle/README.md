---
description: "The Academic research layer for a DSH Web profile, including source providers, research controls, report UI and the Academic preset."
kind: "package-bundle"
---

# @deepseek-ai/dsh-academic-bundle

English | [中文](README.zh.md)

## Summary

This bundle adds Academic research to a DSH Web profile. It assembles source providers, the research controller, browser controls and the Academic agent preset. The shipped `web` profile includes it after the base and Web bundles. Custom profiles can include or omit the layer without editing the generic Web application. It requires the matching Harness services; it is not a standalone research engine.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

The checkout's `pnpm run insight:web` and `pnpm dsh web` select the shipped Web profile. For a custom profile in this installation, include these ordered entries in its `package.json` under `dsh.profile.bundles`:

```json
["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-academic-bundle"]
```

The bundle resolves from the CLI installation. Another distribution must install the bundle and its workspace dependency closure at matching versions. Follow the [profile contract](../../boot/app-boot/README.md#profiles) for installation and resolution. Existing customized profiles follow the [migration guide](../../../docs/upgrade-guide/v0.2.1-rc.2/academic-bundle/guide.md).

After launch, Academic appears in the preset selector and provides research planning, execution and report controls. The profile patch remains the place for local source policies and model budgets: it applies after the bundle. A patch replaces a row's entire configuration, so retain the other required fields when changing one setting.

## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| File | Responsibility |
| --- | --- |
| [cordis.patch.yml](cordis.patch.yml) | Source registry, five providers and the research controller defaults. |
| [web.patch.yml](web.patch.yml) | Academic Remote registration and browser UI plugins. |
| [presets/academic.patch.yml](presets/academic.patch.yml) | Academic preset, planning instructions and skill resolution from this installed bundle. |
| [Academic skill](presets/academic/skills/academic-insight-report/SKILL.md) | Research instructions and linked plan/report templates. |
| [src/index.ts](src/index.ts) | Empty distribution entry; the profile composer reads patches from the manifest. |

Business algorithms remain in `packages/academic`, the Remote adapter in `packages/academic/research-controller`, and browser behavior in `packages/academic/ui-research`. Existing row IDs, Remote names and Session formats are preserved. The bundle owns assembly, not additional implementations of those modules.

</details>

## Further Exploration

- [Academic system reference](../../../docs/academic-insight.md)
- [Workflow entry points](../workflow/README.md)
- [Extraction decision](../../../.agents/notes/implemented/architecture/2026-11-03-academic-composition-bundle.md)

## Model Experience

Indirectly, through the preset plugins and workflow packages assembled by this layer; the existing planning instructions and skill resources move with their configuration.

#### KV Cache effect

The extraction preserves prompt text and research defaults. The filesystem skill resource now resolves inside this bundle; loading its content can expose the changed resource path. Request construction and cache effects remain owned by the preset and workflow consumers.

## Known Limitations and Deferred Work

- The complete bundle expects the Web and base layers. Reusing individual algorithms outside Harness requires adapters for their dependencies; copying this directory alone is insufficient.
- Released Academic Session event support and generated Remote contracts still cross package boundaries.
- Customized profile bundle lists are not automatically rewritten.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep Academic registrations in this bundle. Upstream integration consists of the CLI dependency, the Web profile selection and its exact legacy-tuple normalization. The composition tests verify default activation and omission from a plain Web composition; the existing Web preset end-to-end test exercises skill loading and plan approval through the real Loader.

</details>
