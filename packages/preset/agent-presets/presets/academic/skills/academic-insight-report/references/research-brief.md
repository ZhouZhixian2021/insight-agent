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
- Included version states (preprint, accepted manuscript, version of record):
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

`includedWorkTypes` selects version states only: `preprint`, `accepted_manuscript`, and `version_of_record`. These do not distinguish conference papers from journal articles. Do not put publication categories in this field or promise strict conference/journal filtering; the workflow has no reliable publication-category field. `allowPreprints: false` excludes preprints even when they appear in the list. Describe the same version scope in the readable plan and obtain approval before changing an already reviewed scope.

The executable report currently requires `language: "zh-CN"`, `citationStyle: "numeric"`, and `targetLength.unit: "characters"`. Supported sections are `executive_summary`, `scope_and_method`, `technology_overview`, `paper_landscape`, `cross_paper_analysis`, `key_findings`, `limitations`, `research_gaps`, `references`, and `evidence_appendix`; `research_scope` and `directions` are accepted aliases for `scope_and_method` and `technology_overview`. Do not promise another format as executable. If the requested scope cannot be expressed, discuss the limitation with the user before submitting the plan.

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
  "includedWorkTypes": ["preprint", "accepted_manuscript", "version_of_record"],
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
