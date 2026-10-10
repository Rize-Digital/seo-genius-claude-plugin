# Acceptance: /seo-genius:page-check

## Smoke prompts
1. `/seo-genius:page-check homepage`
2. `/seo-genius:page-check` followed by a service page described in words ("the driveway page").
3. "What's wrong with my pricing page?" in plain words.

## Expected tool sequence
Prompt 1 (the homepage): get_my_tenant -> list_sites -> get_business_context -> search_pages (the site's name, match_count 50; take the site-root URL) -> [no site-root row: search_pages once more with the tagline, match_count 50] -> list_issues (page_id, limit 50) -> get_page (once)
Prompts 2 and 3: get_my_tenant -> list_sites -> get_business_context -> search_pages (descriptive phrase, match_count 5) -> [on mode "text" with no match: search_pages once more with two or three title or H1 words] -> [ask user if more than one candidate] -> list_issues (page_id, limit 50) -> get_page (once)

## Pass conditions
- [ ] Prompt 1: no search_pages query contains "home page" or "landing page". The first call sends the site's name with match_count 50, and the page chosen is the site-root URL.
- [ ] Prompts 2 and 3: the first search_pages call receives a descriptive phrase, never a single word.
- [ ] Prompts 2 and 3: when that call returns mode "text" and no match, exactly one more search_pages call runs with two or three title or H1 words before list_pages.
- [ ] A list_pages fallback call carries no q.
- [ ] The reply confirms the matched page URL before listing issues.
- [ ] Only that page's issues appear, each with current and recommended values.
- [ ] get_page is called at most once.
- [ ] When no page matches, the reply asks for the URL instead of guessing.
- [ ] The closing line names what was capped.

## Fail conditions
- Issues from other pages in the table.
- A second get_page call.
- A crawl issue count anywhere.
