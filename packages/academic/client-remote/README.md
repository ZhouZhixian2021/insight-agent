---
description: "Connect Academic browser controls to the research controller through the shared Remote transport."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-client-remote

English | [中文](README.zh.md)

## Summary

Use this package to connect Academic browser controls to the research controller. The Academic bundle loads it automatically. Custom browser compositions can load it with the shared Gateway and matching controller. It adds no research commands or credentials of its own.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Select the [Academic bundle](../bundle/README.md), which mounts this plugin before the research UI. Custom compositions need the Gateway's Client Remote transport and the matching Host [research controller](../research-controller/README.md). Import this package's `/client` entry for the Academic Remote type augmentation; depend on `remote.academicResearch` before calling it. Generic API Remotes no longer installs Academic methods.

## Understand the implementation

The Client entry mounts the controller's generated `/remote` descriptor and returns its disposer. Unloading removes this namespace through Gateway's existing lifecycle. The empty Host entry allows Loader discovery; it creates no second transport or server. Compilation occurs in the Client phase after the Host controller generates its descriptor.

## Model Experience

### Browser method registration

#### What the model sees

Installing `remote.academicResearch` adds no model-visible messages, tools or prompts. Invoked research operations retain their workflow-owned model behavior.

#### Token effect

Mounting or withdrawing browser methods consumes no model tokens. Research requests can invoke the configured workflow.

#### KV Cache effect

No direct effect. Invoked research operations retain their workflow-owned model behavior.

## Known Limitations and Deferred Work

- Requires a compatible Gateway and generated research controller descriptor; the directory alone is not a standalone API client.
- Does not forward additional Host events or register the backend controller.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep Academic registration here and shared transport in Gateway. Update the bundle's browser patch and UI dependencies when the registration package changes.

</details>
