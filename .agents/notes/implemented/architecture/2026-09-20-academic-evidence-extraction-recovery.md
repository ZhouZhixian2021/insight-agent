# Agent Note: Academic evidence extraction has bounded recovery and explicit stage settlements

Status: implemented

English | [中文](2026-09-20-academic-evidence-extraction-recovery.zh.md)

## Problem

Academic source search and full-text acquisition could succeed while the per-paper model response reached its output-token cap or returned an exact quote under the wrong supplied segment index. The aggregate `RetrievalRun` then failed because no paper reached analysis, and the Web label “Retrieval result” made that later extraction failure look like source retrieval had failed.

## Decision

The application supplies an explicit per-paper model-attempt bound. The Web deployment uses two total attempts. The workflow retries when a recorded model result ends with `finish.kind: max-tokens` or a configured `TRANSPORT` or `TIMEOUT` failure. The Web deployment waits 10 seconds before the second evidence attempt so a terminated long-running connection can clear before another dispatch. Every attempt has its own durable request and result record with `attempt` and `maxAttempts`. Invalid JSON, tool calls, unsupported output, admission failures, persistence failures and cancellation do not retry.

The Web deployment partitions a long paper into ordered evidence batches whose complete framed input is estimated at no more than 12,000 tokens. A source segment that cannot fit is split with 512 repeated boundary characters, while every returned local segment index is mapped back to the original parsed segment before exact-quote verification. Each dispatched attempt has a 120-second operation-local timeout. A failed batch does not discard evidence from validated sibling batches; the paper settles as partially extracted. All batches failing still fails the paper, and an externally cancelled run remains cancelled rather than becoming a timeout.

The extraction prompt spends the response budget on the final JSON. It forbids candidate-excerpt inventories and quota planning, prefers one strongest entry per focus question, and asks for one most appropriate card item per evidence entry unless the same excerpt directly supports a separate required fact. These bounds reduce reasoning latency without changing exact-quote validation or requiring every focus question to have evidence.

Evidence verification keeps the requested segment when the verbatim excerpt matches it. When a valid segment index points elsewhere, the extractor may relocate the excerpt only if the unchanged excerpt has exactly one exact occurrence across all supplied segments. Ambiguous quotes and normalized or OCR-altered text still fail.

Source verification failures are isolated per model draft. Accepted records retain their locators, hashes and card links; rejected drafts return their original indexes and reasons. The workflow distinguishes partial extraction from complete rejection, passes accepted evidence to analysis, and counts one failed extraction operation per affected paper. Report limitations and the Web disclose the rejections. Invalid program-owned inputs, generator errors and whole-response JSON errors remain call-level failures. Raw model requests and results remain the durable replay inputs; the rejection projection itself does not add cross-run persistence.

The Academic Remote returns producer-owned `search`, `fulltext`, and `extraction` stage settlements. The Web displays those stages separately and names the aggregate `retrievalRun.status` as the research processing result.

## Alternatives considered

**Discard the paper on the first unmatched excerpt.** Rejected because one rewritten formula does not invalidate independently verifiable excerpts from the same version. Partial acceptance preserves exact-source requirements without treating the whole paper as fully verified.

**Raise the output-token cap again.** Rejected as the recovery policy because it increases cost and context reservation without distinguishing an occasional incomplete answer from consistently unbounded output.

**Accept fuzzy or normalized excerpts.** Rejected because changing Unicode, whitespace, punctuation, or OCR artifacts would weaken source traceability.

**Infer stage status in the browser from counts.** Rejected because the producing workflow owns stage semantics and the client must render producer facts.

## Consequences

One transient output-limit, connection, or timeout response can recover without repeating source search or full-text acquisition. Long papers no longer depend on one unbounded stream, and validated batches survive a sibling timeout. Durable records reveal every attempt. A model-supplied locator typo can recover without accepting a changed quote. The Web can show “source search: success”, “full-text acquisition: success”, and “evidence extraction: failed” for the same completed run. The bounded answer may retain fewer secondary excerpts from one paper. Fuzzy quotation recovery and cross-run resume remain deferred.
