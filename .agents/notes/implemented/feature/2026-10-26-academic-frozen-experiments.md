# Agent Note: Frozen Academic C-module experiments

Status: implemented

English | [中文](2026-10-26-academic-frozen-experiments.zh.md)

## Problem

Repeated full research changes retrieval, evidence and model output while consuming time. C-module report experiments need fixed upstream material and identifiable code without changing production Sessions.

## Decision

A developer-only export selects one completed run by Session file and researchRunId. It reads concatenated Zstandard frames with the existing decoder and retains only selected research facts, model-visible text, safe model settings and Trace. It rejects incomplete generations and concurrent source changes. No chat headers, credentials or reasoning streams are exported. New output directories and checksums protect existing bundles.

Analysis input and original report remain recorded facts. Report parameters are reconstructed from the recorded analysis response, checkpoint and report; original Claim IDs remain stable, links are recreated, and disclosure is recovered from rendered Markdown. The manifest names every reconstruction and marks an unrecorded original code revision unknown. Local C source snapshots identify uncommitted edits. Raw full-text bytes are not reconstructed.

Offline replay runs source report/eval and the standalone viewer without a model. Comparisons ignore regenerated assessment IDs and preserve input timestamps. Prompt preparation only writes current prompts; importing an externally recorded response permits controlled analysis experiments without adding provider execution. All private artifacts default to the ignored .artifacts tree.

The compare-writing operation renders two externally authored C writing drafts over the same frozen input and treats the selected citation sets as outputs rather than forced controls. Explicit task-template and open-source-inspired strategies retain conditions, real table values and original excerpts. Experimental prose is distinct from source evidence and production Claims. Outputs always remain drafts; mechanical checks do not establish semantic approval. Prepared prompts are reusable specifications, not fabricated provider execution logs. Supplied writing examples identify their author. Real model comparisons use a separate private dsh profile, the recorded model route and generation settings, immutable common material, and Session-backed request/result records. The same postprocessor quarantines unknown evidence references without guessing repairs; raw model outputs remain unchanged. Selected evidence sets are measured outputs. One call per treatment is not a statistical improvement claim.

## Alternatives considered

Rerunning the whole workflow confounds code changes with upstream variation. Copying whole Sessions exports unrelated context and retains excessive data. Treating parsed output as a fresh model answer would misstate the experiment.

## Consequences

This adds developer tooling, not a production Web button, new model route or automatic export. It extends the [Trace adapters](../architecture/2026-10-21-academic-trace-adapters.md) and [HTML delivery](2026-10-26-academic-html-delivery.md) without superseding them. Tests cover unchanged sources, secret filtering, response import, immutable inputs, repeatable reports and multi-frame decoding. The supplied Mixup/CutMix run provides a real fixed-material replay; standalone preview does not establish main-Web visual parity.
