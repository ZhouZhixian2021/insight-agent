# Upstream overrides and generated-artifact replay

English | [中文](README.zh.md)

This directory turns "what we changed in upstream" into data that can be checked and recomputed, instead of knowledge scattered across 129 files.

## Why it exists

`master` is upstream ([`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)) plus our own development. That development takes two forms:

- **Added files** (the 998 paths under `packages/academic/*` and friends) — upstream has no file with that name, so they never conflict;
- **Rewritten upstream files** (the 175 registered here) — a conflict appears as soon as upstream touches the same region.

The second form is the only source of upgrade cost. This directory does two things: every rewrite has an owner, a reason, and a ceiling, and the generated ones never enter manual merging.

## Everyday commands

```sh
# Gate: do the manifest and the working tree agree? CI and local runs both use this.
pnpm run upgrade:check

# Stricter: also reject new rewrite paths (PR against origin/master).
pnpm run upgrade:check:strict

# List the files still missing an owner or a reason.
node scripts/upgrade/verify-upstream-overrides.mjs --report

# Replay generated artifacts, then run again to prove idempotence.
pnpm run upgrade:replay

# Print the replay plan without executing it.
node scripts/upgrade/replay-generated.mjs
```

`--allow-stale` is for an upgrade merge window only: the manifest and the tree disagree by definition while the merge is open, and the gate must pass again once it closes.

## Predicting the next upgrade

Run the impact report before merging. It intersects the files upstream changed since the recorded baseline with the registered rewrites, so the conflict surface is known in advance instead of discovered hunk by hunk.

```sh
node scripts/upgrade/impact.mjs
node scripts/upgrade/impact.mjs --fail-on-overlap
```

## Using it during an upgrade

1. Record `UPSTREAM_SHA=$(git rev-parse upstream/master)` before merging;
2. In a conflict, generated artifacts always take the upstream side: `node scripts/upgrade/verify-upstream-overrides.mjs --restore-generated`;
3. Resolve sources and dependency manifests, then run `pnpm install`;
4. Run `pnpm run upgrade:replay` to recompute every generated artifact (the second pass must change nothing);
5. Run `pnpm run build:artifacts && pnpm run build:check` and the remaining gates;
6. Register any new rewrite path, then run `pnpm run upgrade:check`.

## Adding a rewrite

Add one entry to `entries` in `upstream-overrides.json`:

```json
{ "path": "packages/foo/src/index.ts", "category": "fork", "owner": "name", "reason": "why upstream's file itself must change" }
```

- `category` is one of `fork` (hand-written change), `generated` (build product), `wiring` (integration point);
- A file marked `generated` without a generator marker and without an entry in `generatedExemptions` fails the gate as a miscategorization;
- One more `fork` entry pushes the count past `budget.maxForkFiles` and fails the gate. That is deliberate: **the rewrite count may only shrink**.

## Generated artifacts

`generated-map.json` records which command recomputes each of the 40 generated artifacts. The test is always the same: **can one command rebuild this file completely?** If it can, no one edits it by hand, and no one resolves it by hand during an upgrade.

`replay-generated.mjs --apply` runs everything twice and compares `git status`: any change on the second pass is an error, because it means some content is not computed by a script. The generators spawn tsx and esbuild, so a confined sandbox rejects the pipe access; run this step in a normal terminal.
