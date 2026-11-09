# Upstream overrides and generated-artifact replay

English | [中文](README.zh.md)

This directory records upstream rewrites and their regeneration commands so maintainers can inspect the upgrade work from one maintained inventory.

## Why it exists

`master` is upstream ([`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)) plus our own development. That development takes two forms:

- **Added files**, including `packages/academic/*`, reduce direct file conflicts but still depend on upstream APIs, build rules, and data formats;
- **Rewritten upstream files** require a merge review when upstream changes overlap the local edits. The current inventory is `upstream-overrides.json`.

The inventory gives every rewrite a maintenance owner, a reason, and a category. Generated artifacts are rebuilt from their owning sources; added business modules also require compatibility review when their framework dependencies change.

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
- The gate fails when registered manual rewrites exceed `budget.maxForkFiles`. Register missing historical changes accurately even when that exposes an existing overrun; retire justified rewrites instead of relabeling them or increasing the ceiling to hide the debt.

## Generated artifacts

`generated-map.json` records the command that recomputes each registered generated artifact. Only classify a file as generated when its owning command can rebuild it completely; manual code and prose remain manual rewrites.

`replay-generated.mjs --apply` runs everything twice and compares `git status`: any change on the second pass is an error, because it means some content is not computed by a script. The generators spawn tsx and esbuild, so a confined sandbox rejects the pipe access; run this step in a normal terminal.
