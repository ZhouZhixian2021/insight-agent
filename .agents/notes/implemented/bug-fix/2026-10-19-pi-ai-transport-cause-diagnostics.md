# Agent Note: Preserve pi-ai HTTP transport causes for operator diagnostics

Status: implemented

English | [中文](2026-10-19-pi-ai-transport-cause-diagnostics.zh.md)

## Problem

pi-ai reduces caught HTTP errors to a message before the Harness adapter receives its terminal event. A failed academic candidate review could therefore report `Connection error.` hundreds of times without the socket or proxy error code that would identify the failing link. The existing `TRANSPORT` classification supports retry policy but cannot explain the incident.

## Decision

The pi-ai adapter injects one HTTP fetch wrapper per model call. The wrapper retains the original error name and bounded `code` values from its `cause` chain when request establishment fails. For successful event-stream responses, it also observes body-read failures. It records HTTP status and an allowlisted request ID when a response exists. On a terminal `TRANSPORT` or `TIMEOUT` finish, the plugin writes one call-local diagnostic containing those facts, the route, model, failure code, and elapsed time. The user-visible LLM failure and retry classification remain unchanged. Diagnostics exclude raw exception messages, URLs, headers, credentials, and payloads.

## Alternatives considered

**Classify only the flattened message.** Rejected because `Connection error.` cannot distinguish a proxy reset, upstream socket close, or another fetch failure.

**Add the raw error to the Session or LLM failure.** Rejected because raw causes can contain endpoint details and would widen durable and user-facing data formats for an operator-only need.

**Fork pi-ai to preserve every provider error.** Deferred because its current request options admit an injected HTTP fetch; the local hook covers the active OpenAI-compatible route without maintaining a fork.

## Consequences

HTTP request and event-stream failures can now retain machine-readable cause codes even after pi-ai flattens its terminal error. Providers that do not use the injected HTTP fetch, and failures arising inside provider parsing after the stream is read, still have only the flattened message. The wrapper does not change retries or academic workflow outcomes.
