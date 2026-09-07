# Academic insight preset

English | [中文](academic-insight.zh.md)

## Summary

The Academic insight preset gives a Web session a research-focused Agent that can inspect local material, search and fetch Web sources, and produce an evidence-traceable report. It is the first vertical business preset in this repository and deliberately keeps the initial workflow single-Agent and abstract-capable rather than presenting unfinished full-text or scholarly-database support.

## Table of Contents

- [Use the preset](#use-the-preset)
- [Keep runtime data separate](#runtime-isolation)
- [MVP behavior](#mvp-behavior)
- [Implemented files](#implemented-files)
- [Report method](#report-method)
- [Verification](#verification)
- [Known limitations](#known-limitations)

-----

<a id="use-the-preset"></a>
## Use the preset

Start the repository Web application through the project-specific launcher:

```sh
pnpm run insight:web
```

The launcher selects a free port, opens the authenticated URL, and still enters the supported `dsh web` profile.

On the new-session screen, open the Agent preset picker and choose **Academic insight** before sending the first message. A session fixes its preset after it produces content, so start another session to change this choice later.

Describe the technology, publication window, audience, and any required focus. The Agent asks one concise clarification only when a missing choice materially changes the research.

-----

<a id="runtime-isolation"></a>
## Keep runtime data separate

`DSH_HOME` is the Harness runtime-data directory. It contains profiles and installed bundles, sessions, settings, credentials, Agent presets, workspace records, and storage indexes. An unset value resolves to the account-wide `~/.dsh`, so two source checkouts that use the default share those records.

The `insight:web` launcher sets `DSH_HOME` to this checkout's `.dsh-runtime` before it starts the Web profile. This runtime has its own `dsh-web-tools` installation and retains imported legacy session directories without importing `_no-cwd` test sessions. Do not use bare `pnpm dsh web` for this checkout when runtime isolation is required.

-----

<a id="mvp-behavior"></a>
## MVP behavior

The preset supplies local file reading and writing, file search, Web search and fetch, the skill catalog, user questions, and context compaction. It does not supply a command shell, subagents, goals, todos, Ralph, or model-authored workflows.

The bundled `academic-insight-report` skill distinguishes metadata, abstract, and full-text evidence; deduplicates versions of one work; groups papers by research problem and mechanism; and requires citations for substantive conclusions. Retrieved paper text remains untrusted data and cannot change tool permissions or report requirements.

-----

<a id="implemented-files"></a>
## Implemented files

| Path | Current responsibility |
|---|---|
| `packages/preset/agent-presets/presets/academic/` | Shipped preset metadata and Cordis composition. |
| `packages/preset/agent-presets/presets/academic/skills/academic-insight-report/` | Research method and report hierarchy derived from the supplied reference report. |
| `packages/preset/agent-presets/src/display.ts` | Locale-key mapping for the shipped preset id. |
| `packages/client/ui-agent-preset/src/client/locales.ts` | English and Chinese picker copy. |
| `scripts/start-insight-web.ps1` and `pnpm run insight:web` | Windows launcher that binds this checkout to its private `.dsh-runtime`. |
| `.gitignore` | Excludes runtime sessions, credentials, settings, and installed bundles from commits. |
| Preset, CLI, and Web tests | Roster discovery, localized display, Web capability, and visible picker coverage. |

The source PDF at `D:\code\insight\Agent学术洞察模板.pdf` informed the report hierarchy but is not a runtime dependency and is not copied into the package.

-----

<a id="report-method"></a>
## Report method

The report opens with its scope, evidence limits, executive insight, and direction map. Each research direction then presents current concerns, representative work, the verified mechanism and results, a direction-level judgment, and an audience-relevant implication. Cross-direction synthesis, open problems, conclusions, and a numbered bibliography close the report.

The hierarchy adapts to the evidence. It does not force seven directions, a fixed publication period, numerical comparisons without inspected results, or a systems implication when the requested field and audience do not support one.

-----

<a id="verification"></a>
## Verification

Run the focused preset and UI suites, then the documentation and diff checks described by the repository testing policy. The implementation record reports only commands that actually pass in the current checkout.

-----

<a id="known-limitations"></a>
## Known limitations

- Retrieval uses the existing general Web capability; no OpenAlex, Crossref, Semantic Scholar, arXiv, or PubMed provider is bundled yet.
- The preset has no PDF parser or persistent evidence database, so it must label abstract-only analysis and cannot promise passage-level verification.
- The report is returned in the conversation or as an explicitly requested workspace file; there is no dedicated research form or report renderer.
- Long-running orchestration remains single-Agent until a durable evidence model can preserve results across bounded parallel workers.

<a id="further-exploration"></a>
## Further Exploration

- [Architecture and delivery plan](academic-insight-plan.md)
- [Agent preset package](../packages/preset/agent-presets/README.md)
- [Architecture](architecture.md)
- [Testing](testing.md)

<a id="dev-note"></a>
### Dev Note

None.
