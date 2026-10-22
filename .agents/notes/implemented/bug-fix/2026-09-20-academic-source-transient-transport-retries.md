# Agent Note: Academic source providers bound transient transport retries

Status: implemented

English | [中文](2026-09-20-academic-source-transient-transport-retries.zh.md)

## Problem

The public arXiv and OpenAlex endpoints can fail one connection or exhaust one request deadline and then succeed on the same unchanged query. A source round already preserves another provider's results, but an exact-paper run can still lose the authoritative record needed for date eligibility and full-text resolution. The same arXiv connection timeout occurs through plain `fetch` and the built-in HTTP fetch provider when no proxy policy is configured, so changing capability paths does not remove the transient failure.

## Decision

The arXiv and OpenAlex providers expose `maxAttempts` and `retryDelayMs`. Both default to one attempt; the Web composition explicitly selects two attempts. arXiv repeats only failures that happen before an HTTP response exists. OpenAlex repeats network failures and its own per-attempt timeout. Each attempt sends the same caller-supplied query.

HTTP responses, rate limits, parsing failures, and caller cancellation remain terminal for that provider call. The Academic source runtime keeps its per-provider deadline, partial-success batch, and cancellation behavior; retries cannot extend beyond the outer deadline.

## Alternatives considered

**Retry in the Academic source runtime.** Rejected because the service would need provider-specific retry classification and would change every provider's execution policy. Transport recovery remains with the provider that classifies the failure.

**Route searches through the general Web fetch capability.** Rejected because the built-in HTTP provider reproduced the same arXiv connect timeout, while selecting a general fetch provider also couples scholarly API parsing to the deployment's page-fetch choice.

**Retry every failed response.** Rejected because rate limits, malformed responses, and HTTP errors require source-specific handling rather than an automatic duplicate request.

## Consequences

The shipped Web composition can recover one transient arXiv or OpenAlex transport failure without generating a new query or hiding final failure records. A retry adds bounded latency, and a persistently unreachable endpoint still appears in the existing partial-success result. The workflow reports that providers may repeat transport attempts instead of claiming that every query always sends one request.
