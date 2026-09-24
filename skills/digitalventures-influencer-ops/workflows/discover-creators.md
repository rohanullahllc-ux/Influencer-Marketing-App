# Discover Creators

## Objective
Produce a source-backed creator candidate set for a specified product or campaign.

## Inputs
- product_id
- approved target creator profile
- platform
- niche/sub-niche
- geography if relevant
- desired candidate count
- discovery constraints

## Procedure
1. Load approved Product Intelligence.
2. Translate the target creator profile into observable search criteria.
3. Discover candidate creators using approved available sources/tools.
4. Record the source for every candidate.
5. Capture only facts actually observed.
6. Deduplicate candidates.
7. Mark missing fields unknown.
8. Save creator records.
9. Report discovery coverage and blockers.

## Output
Return candidate count, creator records created, source coverage, missing information, duplicates removed, and the next workflow step: qualification.
Do not qualify or match merely because a creator was discovered.