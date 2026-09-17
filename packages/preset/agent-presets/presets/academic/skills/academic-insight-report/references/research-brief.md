# Research Brief template

Use this structure for the plan submitted through `exit_plan_mode`. Replace every placeholder with a concrete decision or an explicit assumption.

The reviewed Markdown is also the machine-readable handoff to the research workflow. Include exactly one `academic-research-brief-json` fenced block, keep its field names and value types unchanged, and make its values agree with the readable sections. Do not put IDs, versions, or approval fields in the block; the host derives them from the successful plan review.

## Research objective

- Topic and aliases:
- Decision or question the report supports:
- Primary research questions:
- Intended audience and depth:

## Evidence scope

- Publication window:
- Included publication types:
- Inclusion criteria:
- Exclusion criteria:
- Local materials to inspect:
- Required sources and evidence level:

## Analysis and deliverable

- Direction-classification method:
- Comparison dimensions:
- Citation and uncertainty rules:
- Report structure and output format:

## Execution

1. Inspect the supplied local material.
2. Run complementary scholarly searches and deduplicate the evidence set.
3. Verify claims at metadata, abstract, or full-text level.
4. Synthesize research directions, disagreements, gaps, and opportunities.
5. Draft and audit the evidence-traceable report.

## Completion criteria

- Search stopping rule:
- Required coverage:
- Quality checks:
- Time, cost, or source-access constraints:
- Assumptions requiring disclosure:

## Structured workflow handoff

```academic-research-brief-json
{
  "schemaVersion": 1,
  "topic": "<research topic>",
  "aliases": ["<search alias>"],
  "questions": ["<primary research question>"],
  "publicationWindow": {
    "start": { "iso": "2020", "precision": "year" },
    "end": null,
    "dateBasis": "first_public_release"
  },
  "includedWorkTypes": ["preprint", "conference_paper", "journal_article"],
  "inclusionRules": ["<rule for including a work>"],
  "exclusionRules": ["<rule for excluding a work>"],
  "evidenceRequirements": {
    "minimumIncludedWorks": 3,
    "minimumFulltextWorks": 2,
    "minimumEvidenceLevel": "fulltext",
    "requireLocatableEvidence": true,
    "allowPreprints": true,
    "insufficientEvidencePolicy": "continue_with_warning"
  },
  "targetAudience": "<intended audience>",
  "reportRequirements": {
    "language": "zh-CN",
    "targetLength": { "unit": "characters", "minimum": null, "maximum": null },
    "requiredSections": ["research_scope", "directions", "limitations", "references"],
    "citationStyle": "numeric",
    "includeEvidenceAppendix": true,
    "includeMethodology": true,
    "includeLimitations": true,
    "includeResearchGaps": true
  },
  "stopConditions": {
    "maximumSearchRounds": 3,
    "maximumCandidateWorks": 30,
    "maximumIncludedWorks": 10,
    "maximumElapsedMinutes": null,
    "saturationRounds": 2,
    "stopWhenEvidenceRequirementsMet": true
  },
  "assumptions": ["<assumption disclosed to the user>"]
}
```
