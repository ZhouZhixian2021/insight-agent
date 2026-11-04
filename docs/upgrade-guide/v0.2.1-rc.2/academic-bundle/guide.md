---
kind: upgrade-guide
description: "Customized Web profiles must select the Academic bundle after Academic registrations move out of the generic Web bundle."
---

# Academic research becomes a separate bundle

English | [中文](guide.zh.md)

## Change

Academic sources, controller, browser registration and preset resources move from `dsh-web-app` to `@deepseek-ai/dsh-academic-bundle`. The stock `web` profile includes the new layer. An existing `web` profile containing exactly the base and Web bundles is normalized on launch, preserving other manifest fields and its patch. Customized bundle lists remain unchanged and need the new layer to retain Academic functionality. Session data and existing configuration row IDs are unchanged.

Academic browser method registration now belongs to `@deepseek-ai/dsh-academic-client-remote`; importing common API Remotes alone no longer installs or declares `remote.academicResearch`. The Academic bundle includes this registration and the business UI contributions.

## Migration

1. In a customized profile's `package.json`, add `@deepseek-ai/dsh-academic-bundle` immediately after `@deepseek-ai/dsh-web-app` in `dsh.profile.bundles`. Keep existing custom layers after it so their overrides still apply. The CLI installation ships the bundle; another distribution must install its matching dependency closure.
2. Replace explicit references to `@deepseek-ai/dsh-web-app/presets/academic.patch.yml` with `@deepseek-ai/dsh-academic-bundle/presets/academic.patch.yml`. Skill resources now live under `packages/academic/bundle/presets/academic/skills` in a checkout. Do not also apply the preset patch when the full Academic bundle is selected.
3. Custom Client compositions must load `@deepseek-ai/dsh-academic-client-remote` alongside Gateway. Type consumers import its `/client` entry and depend on `remote.academicResearch`; the Host controller and method names are unchanged.
4. Run `pnpm dsh --profile <name> --dump-config` from the checkout. Confirm `academic-research-controller`, `ui-academic-research` and `preset-academic` each occur once. Then launch the profile and confirm the Academic preset can load its research skill.
