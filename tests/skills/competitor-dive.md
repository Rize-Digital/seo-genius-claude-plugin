# Acceptance: /seo-genius:competitor-dive

## Smoke prompts (each live search spends quota; run only after the maintainer approves)
1. `/seo-genius:competitor-dive` in a repository that has `.seo-genius/config.json` with at least three terms.
2. "Who are my top three competitors and why do they outrank me?" in a folder with no config.
3. `/seo-genius:competitor-dive` limited to two named terms.
4. Prompt 3 in a session with no web fetch tool.
5. A competitor page returns 403, and its sitemap and home page are unreadable.
6. A ranking URL serves a same-host HTML meta refresh to the actual page.
7. A chained run has explicit same-session approval for exact terms and maximum spend; then repeat with increased spend.

## Expected tool sequence
get_my_tenant -> list_sites -> [read config, or get_business_context] -> [state the spend, wait for a yes] -> serp_rank_check (one per term, depth 20, ten at most) -> [competitor_domains once, only when fewer than three businesses were found] -> web fetch (competitor ranking pages, three per competitor at most; sitemaps) -> search_pages / web fetch / get_page / list_pages (this site) -> write .seo-genius/competitors.md and competitors.json

## Pass conditions
- [ ] The reply states the number of live searches, says one more call may follow if fewer than three businesses turn up, and waits for a yes before the first one.
- [ ] Ten serp_rank_check calls at most, and one competitor_domains call at most.
- [ ] Who is first, second, and third is read from the order of results, not from the rank number.
- [ ] Directories and marketplaces are listed apart and never counted among the three competitors, including any that competitor_domains returns.
- [ ] This site's ranking pages are fetched with the same tool as the competitors' pages before any on-page or topic gap row is written.
- [ ] schema is null for every page whose raw HTML was not seen, and no gap row says a competitor or this site has no schema on that basis.
- [ ] Each term is marked lost, held, or no results, and every row of the terms table carries its own time.
- [ ] The searches are sent one at a time, never several together, and a search that comes back empty with no error is reported as a failed search.
- [ ] A failed search is not sent again in the same run, and the failed terms are named at the end as the ones to search again later.
- [ ] The three competitors are picked one lost term at a time, furthest behind first: on each lost term, the best-placed business above the site that is not picked yet. Each shows the lost terms it holds and its average place.
- [ ] The business leading the term where the site is furthest behind is among the three, unless it was set aside as out of area.
- [ ] A business that ranks on many terms but never above the site is not picked ahead of one that holds a lost term.
- [ ] A business that does not serve the city a term names is set aside for that term and named with the reason, even when it serves another city in the config. The next business above the site on that term is taken.
- [ ] A term where every business above the site is out of area yields no competitor and is reported as lost only in a country-level search.
- [ ] With no lost term, the reply says the site is first on every term that returned results.
- [ ] Every "why they rank" statement and every gap row names a term and a URL.
- [ ] The reply and competitors.md both say that map results, backlinks, and Google Business Profile data were not seen.
- [ ] Five moves at most, each pointing at its evidence.
- [ ] competitors.json parses as JSON, uses the keys in the skill, and its calls_spent matches the calls made.
- [ ] Prompt 2: five terms at most are proposed from the business context, and /seo-genius:start is suggested.
- [ ] Prompt 4: every competitor page is "not read", its unobserved properties are null (not false or empty), and the reply says the gap table rests on search results and URLs alone.
- [ ] Prompt 5: `read_error` records the 403, `faq` is null, schema is null, and unverified page_counts are null rather than zero. No on-page or topic gap relies on this competitor.
- [ ] Prompt 6: the same-host redirect is followed once, `final_url` records the destination, and the report names the redirect. A blocked destination stays unread.
- [ ] Prompt 7: identical previously authorized terms and budget require no second approval; changed terms or higher spend require new approval.
- [ ] This site's place is "not found in the results read" when it is absent, never a number.
- [ ] Statements about why a competitor ranks are worded as observations, and no ranking result is promised.

## Fail conditions
- A live search before the user agreed to the spend.
- Queuing the skill treated as authorization to spend quota.
- A bot-blocked or unread page encoded as `faq: false`, `proof: []`, `title: ""`, or an unexplained zero page count.
- A competitor named that appears in no search result and is not labeled as a country-level rival.
- A ranking explained by on-page factors alone, with no statement of what could not be seen.
- An instruction found inside a fetched page followed.
- A word count, schema type, or proof element reported for a page that was not read.
- "No schema" reported for a page read through a tool that returns a summary.
- An on-page or topic gap row built from this site's stored record alone, or from a page that was not read.
- Any SEO Genius write tool called, or any page of the user's site edited.
