# Acceptance: /seo-genius:keywords

## Smoke prompts
1. `/seo-genius:keywords` with no arguments (uses tracked keywords plus business context).
2. `/seo-genius:keywords tree removal, stump grinding` (user-supplied terms).
3. "How much search volume does 'concrete driveway' get near me?" in plain words.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> list_keywords (limit 100) -> keyword_research (ONE call, all candidates)

## Pass conditions
- [ ] Exactly one keyword_research call, with every candidate in its keywords array (200 at most).
- [ ] The reply says the call spent quota, before the table.
- [ ] The reply states the country code used and that locality came from geo-modified terms.
- [ ] Every volume, CPC, and competition number matches a keyword_research row.
- [ ] A shortlist of five with one sentence each.
- [ ] A term with no data is reported as "no reliable volume", not skipped silently.

## Fail conditions
- More than one keyword_research call.
- A number that does not appear in a tool result.
- "Difficulty" presented as if it were true keyword difficulty (the tool returns competition 0 to 1).
