# Agent Note: Academic full text uses call-scoped Web fetch selection

Status: implemented

English | [中文](2026-09-20-call-scoped-web-fetch-provider.zh.md)

## Problem

A deployment can select a general Web fetch provider that converts HTML into readable text or rejects PDF. That behavior is useful for model-facing page fetches, but Academic evidence preparation requires bounded raw HTML or PDF bytes. The Academic controller previously called the deployment default through `ctx.web.fetch()`, so installing `dsh-web-tools` changed the shape of its full-text input and left otherwise resolvable papers as `fulltext_unavailable`.

## Decision

`WebRuntime.fetch()` accepts an optional call-scoped `providerId` after the existing request and cancellation arguments. The call-scoped id participates in the existing deterministic provider resolution and error vocabulary, and does not mutate the deployment default.

`AcademicResearchController` exposes `fulltextFetchProvider`, defaulting to `http`. The Web composition sets it explicitly. Academic full-text calls select that provider while ordinary Web fetches continue to use the deployment's configured provider.

## Alternatives considered

**Change the global Web fetch provider to `http`.** Rejected because it would disable the installed page-extraction behavior for unrelated Web consumers.

**Construct `HttpFetchProvider` inside the Academic controller.** Rejected because it would couple the controller to one transport implementation and bypass the shared Web registry, cancellation, and error policy.

**Add automatic capability negotiation.** Deferred because the current consumer has one explicit requirement and one proven provider. A configurable call-scoped selection solves the observed conflict without adding provider ranking or fallback semantics.

## Consequences

Independent consumers can select a registered fetch provider for one call without changing other consumers. Academic full text receives the raw HTML/PDF contract it already validates, and a deployment can replace `http` through controller configuration. A missing or unavailable selected provider fails with the existing structured Web selection errors instead of silently falling back.
