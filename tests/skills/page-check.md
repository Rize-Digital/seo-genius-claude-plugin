# Acceptance: /seo-genius:page-check

## Smoke prompts
1. `/seo-genius:page-check homepage`
2. `/seo-genius:page-check` followed by a service page described in words ("the driveway page").
3. "What's wrong with my pricing page?" in plain words.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> search_pages (descriptive phrase, match_count 5) -> [ask user if more than one candidate] -> list_issues (page_id, limit 50) -> get_page (once)

## Pass conditions
- [ ] search_pages receives a phrase of three or more words, never a single word.
- [ ] The reply confirms the matched page URL before listing issues.
- [ ] Only that page's issues appear, each with current and recommended values.
- [ ] get_page is called at most once.
- [ ] When no page matches, the reply asks for the URL instead of guessing.
- [ ] The closing line names what was capped.

## Fail conditions
- Issues from other pages in the table.
- A second get_page call.
- A crawl issue count anywhere.
