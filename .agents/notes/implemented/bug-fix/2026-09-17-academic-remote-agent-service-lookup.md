# Agent Note: Academic Remote Agent service lookup

Status: implemented

English | [中文](2026-09-17-academic-remote-agent-service-lookup.zh.md)

## Problem

The Academic Remote created search and fetch adapters that later read `agent.ctx.academicSource` and `agent.ctx.web`. The controller declared both services as its own dependencies, but an Agent context belongs to another Cordis fiber and does not inherit the controller fiber's property-access authorization. A real run therefore failed with `cannot get property "academicSource" without inject` before search.

## Decision

The controller resolves `academicSource` and `web` once through `agent.ctx.get()` immediately after resolving the Agent. It rejects a missing Agent-scoped service with an explicit Remote availability error. The pipeline adapters close over the resolved services and do not read service properties from a foreign fiber during maintenance work.

This preserves the [Academic Remote execution](../architecture/2026-09-16-academic-remote-execution.md) decision that the addressed Agent supplies the Academic and Web capabilities. It does not fall back to the controller's context or change B's providers, A's workflow interfaces, or C's response fields.

## Alternatives considered

**Read services from `this.ctx`.** The controller fiber can access its declared dependencies, but this would ignore an Agent-scoped or isolated provider selected for the Session.

**Add controller dependencies to every Agent context.** An Agent context has its own lifecycle and plugin composition. Granting another plugin's dependency declarations to it would weaken Cordis service ownership and still leave asynchronous callbacks coupled to context property access.

**Keep delayed property reads.** The shipped composition already demonstrates that this fails before the first provider call, and the same pattern would fail again at Web full-text acquisition.

## Consequences

Search and full-text acquisition use the exact services visible from the addressed Agent and remain callable from the controller's maintenance operation. Missing scoped services fail before the workflow starts. The controller test composes service and Agent contexts as sibling Cordis fibers, reproducing the production access rule that the former hand-built root-context fixture did not exercise.
