# Agent Note: Academic HTML delivery

Status: implemented

English | [中文](2026-10-26-academic-html-delivery.zh.md)

## Problem

Academic reports need a readable file outside the live Web application. A second generated narrative could lose citation source links and evidence identifiers, and exporting application markup could retain active code or remote resources.

## Decision

The settled report panel exports one self-contained HTML file alongside Markdown. It uses the existing Markdown renderer through React static rendering in an inert template, then serializes allowlisted elements and safe link attributes. Raw model HTML stays text; only generator-owned numeric paragraph anchors are restored. Styles are inline, scripts and external resources are excluded, and CSP denies active content. Citations remain explicit links; images become alternate text. Report quality, synthetic markers, limitations and evidence references remain visible independently of current UI filters.

## Alternatives considered

A fresh model-written HTML report would add cost and introduce a second unsupported interpretation. Saving live panel markup would capture filtered results and framework controls. A handwritten Markdown parser would duplicate maintained rendering behavior. The inert export reuses the existing parser while explicitly controlling the exported elements.

## Consequences

The file opens offline and does not require credentials or the Harness server. External citation destinations still require connectivity when clicked. Markdown remains available for original source and unsupported formatting. Export is a presentation operation and never changes report approval. Normal, limited and empty-evidence cases, malicious markup and the real Web download are covered by focused tests.

The reading layout borrows sidebar navigation from [Quarto](https://quarto.org/docs/output-formats/html-basics.html) and restrained typography from [Tufte CSS](https://github.com/edwardtufte/tufte-css), without copying their code or adding dependencies. Narrative precedes folded supplementary checks; local evidence aliases retain full records. Support lists fold beside their arguments. Delivery blockers remain expanded and content limitations remain explicitly counted. Source Markdown and delivery decisions are unchanged. Focused tests cover ordering, reachable anchors, complete records and immutable inputs; browser visual and print acceptance remain outstanding.
