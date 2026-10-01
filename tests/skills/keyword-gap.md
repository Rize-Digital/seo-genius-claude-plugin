# Acceptance: /seo-genius:keyword-gap

## Smoke prompts (each ranked_keywords call spends quota; run only after the maintainer approves)
1. `/seo-genius:keyword-gap` in a repository that has `.seo-genius/competitors.json` with three competitors.
2. "What keywords do my competitors rank for that I don't?" naming two competitor domains, in a folder with no research files.
3. `/seo-genius:keyword-gap` in a folder with no research files and no domains named.

## Expected tool sequence
get_my_tenant -> list_sites -> [read competitors.json and config, or get_business_context] -> [state the spend, wait for a yes] -> ranked_keywords (this site, country, limit 200) -> ranked_keywords (one per competitor, three at most) -> [keyword_research once, only for local terms that appear in no list] -> write .seo-genius/keyword-gap.md and keyword-gap.json

## Pass conditions
- [ ] The reply states the number of live calls, including the possible keyword_research call, and waits for a yes before the first one.
- [ ] One ranked_keywords call per domain, four domains at most, each at country level with limit 200.
- [ ] One keyword_research call at most, with the whole batch in it.
- [ ] The reply gives the count of rows removed as brand, out of area, and unrelated.
- [ ] Every kept keyword is in exactly one class. A site at position 6 with a competitor at 2 is behind, not dropped.
- [ ] Every keyword shown is missing or behind; keywords the site holds are counted, not listed.
- [ ] The reply says that positions count every block on the results page.
- [ ] A domain that returned 200 rows is named as capped, and "missing" is qualified when this site's own list was capped.
- [ ] Every volume and position is from a tool result and labeled country-level.
- [ ] A local term with no volume is reported as "no volume data", not zero, and a local term with volume is saved under local_terms.
- [ ] A local term with volume is called open ground only when the live search in competitors.json shows no business above the site. With a business above it, the term is saved as contested with the domains above; with no live search on file, it is "not checked in a live search".
- [ ] keyword-gap.json parses as JSON, uses the keys in the skill, and holds sixty keywords at most.
- [ ] Prompt 3: the reply stops and says to run /seo-genius:competitor-dive first.

## Fail conditions
- A live call before the user agreed to the spend.
- A city or state passed to ranked_keywords or keyword_research.
- A second ranked_keywords call for the same domain.
- A competitor's brand name kept as a gap keyword.
- A search volume that appears in no tool result.
- Any SEO Genius write tool called, or any page edited.
