---
description: Install the pinned dsh-web-tools Web search bundle into an explicit local Harness home without copying credentials.
---

# Pinned Web search installation

English | [中文](README.zh.md)

## Summary

Use the installer after checking out this repository to add the fixed `dsh-web-tools` bundle to the Web profile. The repository carries the compatible package; `.dsh-runtime` remains local and ignored by Git.

## Table of Contents

- [Install](#web-tools-install)
- [Fixed package](#web-tools-package)
- [Local state and failures](#web-tools-local-state)
- [Verification](#web-tools-verification)

<a id="web-tools-install"></a>
## Install

Run from the repository root after installing workspace dependencies and building the [CLI](../../docs/development.md). Select the intended Harness home explicitly; this example uses the home selected by `insight:web`.

```sh
node scripts/install-insight-web-plugin.mjs --home .dsh-runtime --dry-run
node scripts/install-insight-web-plugin.mjs --home .dsh-runtime --offline
```

The archive bundles its ordinary dependency closure and their licenses; a fresh Web profile can install offline with an empty pnpm store. `--store-dir <path>` selects a store. Other packages already added to a profile may need their own cache or `--online` to retrieve missing dependencies. The installer disables package lifecycle scripts and peer auto-installation. It uses the official `dsh plugin --profile web add` command and verifies the installed bundle, built files and dependency versions against [lock.json](lock.json). A matching installed profile returns `already-installed` without rerunning the package manager.

<a id="web-tools-package"></a>
## Fixed package

[lock.json](lock.json) records the author's repository, release tag, source commit, upstream package digest, compatible package digest and bundled dependency versions. [compatibility.patch](compatibility.patch) records the local changes: remove the unused `webRuntime` injection and its unused type, identify the package as `0.3.5+insight.1`, and fix and bundle the ordinary dependencies. The patch preserves the loopback and same-origin configuration fence. The [MIT license](LICENSE) remains with the plugin; each bundled dependency retains its own license inside the archive.

The installer verifies the packed host JavaScript before writing the profile. It copies the archive into the selected home's `plugin-packages` directory so the profile does not depend on an external preparation directory. This integration is not a workspace package and does not add a default bundle to other profiles.

<a id="web-tools-local-state"></a>
## Local state and failures

Credentials, provider choices, sessions and browser profiles remain local. The installer neither copies them nor opens settings, starts the product or calls a provider. Configure credentials separately through the product's existing settings. Opening the plugin settings can check versions, quotas and existing browser authentication; that operation is outside the installer.

A digest mismatch stops before installation. A package-manager failure or post-install mismatch stops without retrying; profile state can be partial. Inspect that home's package-manager diagnostics before another installation. Dependency-version drift requires reviewing the lock rather than silently accepting another resolved package graph.

<a id="web-tools-verification"></a>
## Verification

```sh
node --test scripts/install-insight-web-plugin.test.mjs
```

The focused tests cover the packed host, archive integrity, command plan, credential isolation, idempotent installation and failure containment. They use local fixtures and do not start the product or perform real searches. Existing live provider credentials are not a Git deliverable.
