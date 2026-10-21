# Academic Trace v1 handoff fixtures

English | [中文](README.zh.md)

## Purpose

These synthetic fixtures accompany the [C-T0 interface proposal](../../模块分工/academic-trace-v1-interface-handoff.md). They define review examples, not an installed Remote service or evidence that either base version can collect every field. No real Session, paper, credential or model response is included.

## Files

- [cases.sample.json](cases.sample.json): normal, retry, timeout, cancellation, concurrent calls, duplicate delivery, restart with no settlement, and historical missing fields. Every case contains independent observations and expected counts. Retry includes the run → stage → paper → call → two attempts hierarchy.
- [queries.sample.json](queries.sample.json): two list pages and a failed-attempt detail from the retry case, plus explicit error responses. Cursor strings are opaque fixture tokens; production encoding is not specified here.
- [validate.py](validate.py): dependency-free fixture checks for identities, parent links, attempt counts, deduplication, durations and query consistency. Two negative controls reject conflicting duplicate events and zero substituted for unknown timing.

## Validation

From the repository root, run `python z-team_docs/interface-samples/academic-trace-v1/validate.py`. It reads only these fixtures and performs no network requests, model calls, Session writes or application launches. Expected output reports eight scenarios and two negative controls. It is a handoff checker, not a production schema validator, adapter or authorization test.

## Follow-up

A/B report actual observation points and missing fields using the handoff feedback table. C-T1 must test production projection, persistence, access control, pagination expiry and redaction separately. The fixture checker cannot establish those behaviors.
