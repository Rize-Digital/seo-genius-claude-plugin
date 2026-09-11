# Acceptance: /seo-genius:quick-wins

## Smoke prompts
1. `/seo-genius:quick-wins`
2. "What are my easiest SEO fixes this week?" in plain words.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> list_issues (critical, limit 100) -> list_issues (high, limit 100) -> get_page (only to name the page for a chosen fix) -> ranked_keywords (location_name = country, limit 200)

## Pass conditions
- [ ] Three fixes, each a single field (title, meta description, H1, schema, alt text) with a page and a paste-ready recommended value from the issue row.
- [ ] No fix on an issue that lacks a recommended value.
- [ ] Five striking-distance keywords at most, each with position 4 to 20, the page that ranks, and one move.
- [ ] The reply states the country location_name passed to ranked_keywords and that positions are country-level.
- [ ] When ranked_keywords is empty, the fixes still ship and the reply says the ranking data was empty.
- [ ] The closing line names what was capped.

## Fail conditions
- A fix that requires rewriting body copy or adding a page.
- A keyword outside positions 4 to 20 in the striking-distance list.
- A crawl issue count anywhere.
- More than one ranked_keywords call, or a city or state passed to it.
