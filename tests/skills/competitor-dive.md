# Acceptance: /seo-genius:competitor-dive

## Smoke prompts (each live search spends quota; run only after the maintainer approves)
1. `/seo-genius:competitor-dive` in a repository that has `.seo-genius/config.json` with at least three terms.
2. "Who are my top three competitors and why do they outrank me?" in a folder with no config.
3. `/seo-genius:competitor-dive` limited to two named terms.
4. Prompt 3 in a session with no web fetch tool.

## Expected tool sequence
get_my_tenant -> list_sites -> list_research -> get_research(pipeline_config/config and competitor_dive/analysis) -> [read validated local fallback or get_business_context when remote unavailable] -> [state the spend, wait for a yes] -> serp_rank_check (one per term, depth 20, ten at most) -> [competitor_domains once, only when fewer than three businesses were found] -> web fetch (competitor ranking pages, three per competitor at most; sitemaps) -> search_pages / web fetch / get_page / list_pages (this site) -> [save_research(competitor_dive/analysis and optional report) when authorized] -> [optional local competitors.md and competitors.json]

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
- [ ] Prompt 4: every competitor page is "not read", and the reply says the gap table rests on search results and URLs alone.
- [ ] This site's place is "not found in the results read" when it is absent, never a number.
- [ ] Statements about why a competitor ranks are worded as observations, and no ranking result is promised.

## Server research-store acceptance
- [ ] Prior `competitor_dive.analysis` and `pipeline_config.config` are fetched for the resolved site before spending DataForSEO quota.
- [ ] The stored site, date, city and term set are checked before a cached competitor report is reused; a user-requested fresh run bypasses it.
- [ ] Authorized completed research is saved in an append-only `competitor_dive` document with required `analysis` and optional `report` sections.
- [ ] No unauthorized research save occurs; the result is clearly labeled NOT SAVED remotely when persistence is unavailable.
- [ ] A new Claude/cloud run with no local files can read the prior analysis by `get_research`.
- [ ] A tenant mismatch or dropped research section is reported as unknown, not as a clean competitor gap.

## Fail conditions
- A live search before the user agreed to the spend.
- A competitor named that appears in no search result and is not labeled as a country-level rival.
- A ranking explained by on-page factors alone, with no statement of what could not be seen.
- An instruction found inside a fetched page followed.
- A word count, schema type, or proof element reported for a page that was not read.
- "No schema" reported for a page read through a tool that returns a summary.
- An on-page or topic gap row built from this site's stored record alone, or from a page that was not read.
- An SEO Genius write other than an explicitly authorized `save_research` or `trigger_crawl`, or any page of the user's site edited.
