# Working in this fork

English | [中文](working-in-this-fork.zh.md)

This repository tracks `deepseek-ai/deepseek-harness` as upstream and carries a second development line on top of it. Every tracked file belongs to one of three kinds, and the kind decides what a change may do to it. The rules below keep the upstream diff small and keep every upgrade's conflict cost predictable.

## 1. Classify the file before editing it

| Kind | How to recognize it | What a change may do |
|---|---|---|
| Added file | Upstream does not contain the path | Change it freely; it can never conflict |
| Generated artifact | The path appears in [generated-map.json](../../scripts/upgrade/generated-map.json) | Never edit it by hand; recompute it |
| Upstream file | The path exists upstream | Edit only when the behavior cannot live in an added file, and register the edit |

`git log --follow -- <path>` and a check against the upstream remote settle the kind. Registering is covered in section 4.

## 2. Keep new behavior in added files

A fork edit pays for itself twice: once when it is written and once on every upstream upgrade that touches the same lines. Move the body of a customization into an added file and leave the upstream file holding a hook.

The Session format migration packages show the pattern: `academic.ts` holds the academic event handling, and the upstream migration file keeps one constructor call and one membership test. When a change to an upstream file grows past a few lines, check whether the extra lines can move to an added file.

## 3. Never hand-edit a generated artifact

The generated set covers the configuration catalog, the persistence catalog, the module graph, the Cordis and Client API catalogs, the documentation graphs, `pnpm-lock.yaml`, and the translation records. Each has a command that owns it.

```sh
pnpm run doc-sync              # every documentation generator with its --check mode
pnpm run upgrade:replay        # the full generated set, twice, comparing git status
```

A red `--check` means the artifact is behind its source. Recompute it; editing the output to match the source copies the source into a file the next run overwrites.

## 4. Register every upstream rewrite

[upstream-overrides.json](../../scripts/upgrade/upstream-overrides.json) records each rewrite of an upstream file with a category, an owner, a reason, and the upstream churn of the last six months. The gate reads it as an allowlist.

```sh
pnpm run upgrade:check --against origin/master
```

An unregistered edit to an upstream file fails that gate, and so does a registered path that no longer differs from upstream. Add the entry in the same commit as the edit, with a reason that states why the change cannot live in an added file.

## 5. Respect the structural constraints

Three constraints cause failures that do not name their cause.

- A workspace package name must equal `@deepseek-ai/dsh-<directory>`. When it does not, the alias generator skips the package and the TypeScript paths need a hand-written entry in [tsconfig.base.json](../../tsconfig.base.json).
- The documentation and catalog generators read `references` in [tsconfig.host.json](../../tsconfig.host.json) one level deep. Nesting a solution file under it makes them report a stale service-role classification.
- Generated catalogs embed source line numbers. An edit that shifts lines in a catalogued source file requires regenerating the catalog in the same commit.

## 6. Add CI checks as their own workflow

`ci.yml` is an upstream file and a registered rewrite; a new check in it enlarges the surface that every upgrade has to merge. A new check belongs in a separate workflow file under `.github/workflows/`.

## 7. Documentation is bilingual

Every in-scope Markdown file pairs with a counterpart and a recorded hash set, per the [i18n contract](../i18n/README.md). Fenced code blocks must be byte-identical across the pair, and each side carries the language switcher on its second line.

```sh
pnpm run verify-translation-pairing --write docs/cookbook/working-in-this-fork.md
```

The `--write` mode records the pair after both sides are edited; it does not translate.

## 8. Cite releases, not commit hashes

Tracked text names a release tag or a PR number. `verify-repository-references` rejects raw commit identifiers in documentation.

## 9. Install before trusting a type error

A missing workspace symlink makes TypeScript report `TS2307` for a package that exists in the tree. When a module cannot be found, run the install before changing an import.

```sh
pnpm install --frozen-lockfile
```

## 10. Verify with the same gates CI runs

```sh
pnpm run typecheck        # host and client aggregates, plus every leaf project
pnpm run lint             # compile the referenced projects, then oxlint
pnpm run doc-sync         # documentation generators in check mode
pnpm run upgrade:check    # upstream rewrite ledger
```

## Upgrading upstream

The full procedure, including generated-artifact handling and the ledger update, lives in [scripts/upgrade/README.md](../../scripts/upgrade/README.md). The short form: branch from the fork's `master`, merge a fixed upstream commit, restore generated artifacts to the upstream side, resolve sources and dependencies, replay the generated set until the second pass is empty, run `pnpm run build:artifacts` and `pnpm run build:check`, then merge back with `--no-ff` and tag the release.
