# Agent Note: Academic paper hash handoff

Status: implemented

English | [中文](2026-09-15-academic-paper-handoff.zh.md)

## Problem

Parsed full text has a hash while the search version can still have an unextracted hash, leaving downstream version and evidence observations inconsistent.

## Decision

The [workflow library](../../../../packages/academic/workflow/README.md) fills a version copy before extraction. First observation preserves identity and inputs; conflicting hashes pause that paper with a retainable record while callers continue other papers. Callers explicitly declare historical binding; missing hashes do not automatically mean first observation.

## Alternatives considered

Minting a version for first acquisition creates artificial selection problems; overwriting a known hash breaks historical evidence. Neither is used.

## Pipeline

runResearchDraft composes existing search, ingestion, full-text, evidence, analysis and draft report entries, validating selection before acquisition and model work. Paper failures and pauses preserve other papers; cancellation retains completed outcomes. Callers explicitly provide scope selection and external adapters. The function runs one round and grants no semantic approval. Implementation files never import the public index, avoiding internal barrel cycles.

## Consequences

The workflow prompts the model to select only direct answers to the focus questions, with at most six entries per paper and three entries primarily supporting one question. It excludes ancillary details unless they answer a focus question and requests the shortest supporting excerpt. parseEvidenceDrafts enforces the six-entry limit and validates untrusted model JSON against B's six-section draft fields before returning any entries. It constructs typed values rather than trusting a cast; rejects extra fields and model-authored failure identities; and leaves source matching with B. A failed parse cannot be mistaken for an empty successful extraction. This parser has no transport or Session effects. [Parser tests](../../../../packages/academic/workflow/tests/parse-evidence.spec.ts) exercise malformed and oversized responses and pass accepted drafts through the actual B extractor.

B and C interfaces remain unchanged. A's PaperEvidenceGenerator additionally receives parsed provenance; single-argument generators remain assignable. createModelEvidenceGenerator binds a live Session and explicit model configuration to DSH's prepared call. It dispatches the immutable logged request, uses the existing token estimate with output reserve, and records a lossless model stream. Oversized papers return input_too_large; ordinary paper failures preserve other work. Append, checkpoint or read-back failure raises WorkflowLogError and stops the pass, even during cancellation. Log-only academic/evidence-request and academic/evidence-result do not enter main model history; validated denotes JSON validation, not semantic approval. A missing result after process loss is not automatically retried.

SessionStore.flush reports participating listeners, not proof that a live writer retained this Session. The adapter reads back each event after flushing to enforce the user-approved stop-on-storage-failure policy. Model capacity and output caps come from explicit model configuration and provider resolution; unavailable budgets fail before dispatch. The shared estimator remains approximate by user choice. Full workflow recovery and long-paper chunking remain deferred.

## Testing

runModelResearchDraft binds the existing generator to a caller-owned Session and executes the single-pass pipeline with explicit search, selection, acquisition and clock adapters. Integration tests run two parsed papers through the real model service, B's evidence construction and C's evaluated draft; they also prove that actual model admission pauses an oversized first paper while the next proceeds, and a failed result checkpoint prevents the next fetch. The wrapper adds no storage schema, model route defaults or automatic publication.

runAcademicResearchDraft is the application-facing object-parameter entry. It preflights the exact route before external paper work, leaves omitted reasoning to the model route default, preserves and validates explicit choices, and returns the durable Session ID with the pipeline result. Unsupported explicit reasoning therefore fails clearly before search instead of becoming a paper-local extraction failure. It still does not choose a provider, model, paper policy or publication target. The [model-default reasoning fix](../bug-fix/2026-09-17-academic-model-default-reasoning.md) owns this defaulting decision.

[Model tests](../../../../packages/academic/workflow/tests/model.spec.ts) use DSH's real LLM service, token meter and JSONL persistence with scripted external model responses, including disk read-back and storage/cancellation races. Snapshot normalization treats academic result stream clocks like Assistant stream clocks without changing request or response content. The [Academic SDK scenario](../../../../snapshots/sdk/academic-evidence/snapshot.yml) passes refresh and read-only replay through the shipped sdk-minimal profile, including B's evidence construction, persisted records and TypeScript SDK notifications/results. Its shell tools are disabled; the retained editor is not invoked. Windows cwd JSON escaping fixes the initial launch failure; the original full-profile title scenario still differs on Bash/PowerShell schemas. The opt-in [Python process test](../../../../python/sdk/tests/test_academic_snapshot.py) compares source-SDK events and notifications with its expected projection and exact disk records through the built dsh CLI; this does not validate an installed wheel or real model provider. Python SDK shutdown currently emits unclosed-stream ResourceWarning diagnostics, retained as follow-up work rather than suppressed.

[Handoff tests](../../../../packages/academic/workflow/tests/handoff.spec.ts) connect actual HTML parsing and evidence extraction and check first observation, reuse, continuation after a pause, identity mismatches, history protection, and cancellation.
