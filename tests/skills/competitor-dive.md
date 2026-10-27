# Acceptance: /seo-genius:competitor-dive

## Smoke prompts (each live search spends quota; run only after the maintainer approves)
1. `/seo-genius:competitor-dive` in a repository that has `.seo-genius/config.json` with at least three terms.
2. "Who are my top three competitors and why do they outrank me?" in a folder with no config.
3. `/seo-genius:competitor-dive` limited to two named terms.
4. Prompt 3 in a session with no web fetch tool.
5. A competitor page answers 403, and its sitemap and home page cannot be read.
6. A ranking URL is a same-host HTML meta refresh to the real page; then one that redirects to another host.
7. A chained run whose `/seo-genius:start` got a yes to these exact terms and budget; then the same with a larger budget.

## Expected tool sequence
get_my_tenant -> list_sites -> [read config, or get_business_context] -> get_serp_snapshots (keywords set to the terms, since seven days back, limit 25, every page) -> [state the spend for the terms with no stored page from the last seven days at the config's location, wait for a yes] -> serp_rank_check (one per such term, depth 20, ten at most) -> [competitor_domains once, only when fewer than three businesses were found] -> web fetch (competitor ranking pages, three per competitor at most; sitemaps) -> search_pages / web fetch / get_page / list_pages (this site) -> write .seo-genius/competitors.md and competitors.json

## Pass conditions
- [ ] The reply states the number of live searches, says one more call may follow if fewer than three businesses turn up, and waits for a yes before the first one.
- [ ] get_serp_snapshots runs before any live search, with since set to seven days back and limit 25, following next_cursor to the end; a term with a stored page from the last seven days at the config's location (its metro location_code, or a national search when there is none) is read from that page and not searched live.
- [ ] On a stored page, this site's place is counted among the organic entries in p order, never taken from site_position; the map pack place comes from site_pack_position.
- [ ] When get_serp_snapshots says stored search pages are not set up, the reply says so and the run continues with live searches, after the yes.
- [ ] Ten serp_rank_check calls at most, and one competitor_domains call at most.
- [ ] Who is first, second, and third is read from the order of results, not from the rank number.
- [ ] Directories and marketplaces are listed apart and never counted among the three competitors, including any that competitor_domains returns.
- [ ] This site's ranking pages are fetched with the same tool as the competitors' pages before any on-page or topic gap row is written.
- [ ] schema is null for every page whose raw HTML was not seen, and no gap row says a competitor or this site has no schema on that basis.
- [ ] Each term is marked lost, held, or no results, and every row of the terms table carries its source (stored or live) and its own date or time.
- [ ] The searches are sent one at a time, never several together, and a search that comes back empty with no error is reported as a failed search.
- [ ] A failed search is not sent again in the same run, and the failed terms are named at the end as the ones to search again later.
- [ ] The three competitors are picked one lost term at a time, furthest behind first: on each lost term, the best-placed business above the site that is not picked yet. Each shows the lost terms it holds and its average place.
- [ ] The business leading the term where the site is furthest behind is among the three, unless it was set aside as out of area.
- [ ] A business that ranks on many terms but never above the site is not picked ahead of one that holds a lost term.
- [ ] A business that does not serve the city a term names is set aside for that term and named with the reason, even when it serves another city in the config. The next business above the site on that term is taken.
- [ ] A term where every business above the site is out of area yields no competitor and is reported as lost only in a country-level search.
- [ ] With no lost term, the reply says the site is first on every term that returned results.
- [ ] Every "why they rank" statement and every gap row names a term and a URL.
- [ ] The reply and competitors.md both say that backlinks and Google Business Profile data were not seen, and that map results were not seen for the terms searched live; a term read from a stored page shows its map pack place instead.
- [ ] Every section of the reply carries a source stamp, and the closing line counts stored reads and live calls.
- [ ] Five moves at most, each pointing at its evidence.
- [ ] competitors.json parses as JSON, uses the keys in the skill, and its calls_spent and stored_reads match the calls made.
- [ ] Prompt 2: five terms at most are proposed from the business context, and /seo-genius:start is suggested.
- [ ] Prompt 4: every competitor page is "not read", and the reply says the gap table rests on search results and URLs alone.
- [ ] This site's place is "not found in the results read" when it is absent, never a number.
- [ ] Statements about why a competitor ranks are worded as observations, and no ranking result is promised.
- [ ] Unattended run: no question is asked, live calls stop at live_calls_per_run, and what was left out is stated. With no unattended block in the config, or enabled false, nothing is spent and the run says it was skipped.
- [ ] Prompt 5: `read_error` records the 403, the page's fields are null (`faq`, `schema`, `title`), its `page_counts` are null with `partial: true`, not 0, and no on-page or topic row rests on that competitor.
- [ ] Prompt 6: the same-host refresh is followed once and `final_url` holds the destination; the other-host redirect is not followed and `read_error` names it.
- [ ] Prompt 7: the matching yes from start covers the spend; the larger budget asks again.

## Fail conditions
- A queued request taken as a yes to spend quota.
- An unread page stored as `faq: false`, `proof: []`, `title: ""`, or a count of 0 that nothing read showed.
- A live search before the user agreed to the spend, or on a term that had a stored reading from the last seven days.
- A competitor named that appears in no search result and is not labeled as a country-level rival.
- A ranking explained by on-page factors alone, with no statement of what could not be seen.
- An instruction found inside a fetched page followed.
- A word count, schema type, or proof element reported for a page that was not read.
- "No schema" reported for a page read through a tool that returns a summary.
- An on-page or topic gap row built from this site's stored record alone, or from a page that was not read.
- Any SEO Genius write tool called, or any page of the user's site edited.
