# Acceptance: /seo-genius:keyword-gap

## Smoke prompts (each ranked_keywords call spends quota; run only after the maintainer approves)
1. `/seo-genius:keyword-gap` in a repository that has `.seo-genius/competitors.json` with three competitors.
2. "What keywords do my competitors rank for that I don't?" naming two competitor domains, in a folder with no research files.
3. `/seo-genius:keyword-gap` in a folder with no research files and no domains named.
4. `/seo-genius:keyword-gap` again within seven days of prompt 1, after one competitor in `competitors.json` was replaced by a new domain. Use known, recent `source_as_of` values for the three retained lists.
5. "Run the keyword gap again with a fresh pull", within seven days of prompt 1.
6. Re-run without "fresh" when the server returns rows with `cached_at` six days old; save the file today, then run again two days later.
7. Re-run without "fresh" when the server returns rows without `cached_at`.
8. In an unattended run, exercise `site_paused`, `site_archived`, `quota_exceeded`, ordinary 429, and `upstream_unavailable`/timeout responses after one successful domain call.

## Expected tool sequence
get_my_tenant -> list_sites -> [read competitors.json and config, or get_business_context] -> [read .seo-genius/keyword-lists/ and sort each domain into on file or needs a call] -> [state the spend, wait for a yes when any call is needed] -> ranked_keywords (country, limit 200) only for the domains that need a call, each saved to keyword-lists/<domain>.json as it answers -> [keyword_research once, only for local terms that appear in no list and are not on file] -> write .seo-genius/keyword-gap.md and keyword-gap.json

## Pass conditions
- [ ] The reply states the number of live calls, including the possible keyword_research call, and waits for a yes before the first one.
- [ ] At most one ranked_keywords call per domain, four domains at most, each at country level with limit 200, and none for a domain whose saved list was reused.
- [ ] Before the spend is stated, each domain is named as on file with its known source timestamp or as needing a call.
- [ ] A saved list is reused only when it parses, is for that domain, has a valid `source_as_of` no more than seven days old and not in the future, was pulled with the same location, language and limit, and has rows. An older-format file without `source_as_of` is read but not reused.
- [ ] Every successful list call is saved to .seo-genius/keyword-lists/<domain>.json with `source_as_of`/`pulled_on` or explicit nulls and every row in the order returned, as one array per row under columns (keyword, url, position, search_volume, intent).
- [ ] For every saved row the five values equal the tool result. With url_base set, url_base followed by the row's value is the returned URL; with rows on more than one host, url_base is empty and each URL is whole.
- [ ] A file saved by an earlier version, with one object per row and no `source_as_of`, can be read but needs a new pull before its rows can be reused.
- [ ] The reply names each list as requested in this run or reused, gives its known source timestamp, and says its positions and volumes are as of that timestamp. If the source age is unknown, it says so rather than claiming today's date.
- [ ] Prompt 4: exactly one ranked_keywords call, for the new domain; the other three lists are reused; keyword rows from reused lists still carry intent.
- [ ] Prompt 5: one ranked_keywords call per domain, each carrying `fresh: true`; any needed keyword_research call also carries `fresh: true`; no saved file is reused.
- [ ] Prompt 6: the file keeps the exact six-day-old `cached_at` as `source_as_of`, and is no longer reusable two days later even though it was written today. Local-terms files use the same rule.
- [ ] Prompt 7: the saved file has `source_as_of: null` and `pulled_on: null` because an absent `cached_at` could mean a shared server-cache hit; it cannot be reused later. A `fresh: true` answer without `cached_at` can use its answer time as `source_as_of`.
- [ ] With every list on file and no local term to look up, the run makes no live call and does not wait for a yes.
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
- [ ] Unattended run: no question is asked, live calls stop at live_calls_per_run counted across the whole run, and what was left out is stated.
- [ ] Unattended run: a saved list that is reusable is reused, and it does not count toward live_calls_per_run.
- [ ] Prompt 8: paused or archived site, monthly quota exceeded, ordinary 429, and upstream failure/timeout each stop further live calls, preserve valid partial evidence, and report why. A failed site list never produces missing classifications.
- [ ] Prompt 8: every attempted tool call counts against `live_calls_per_run` and `calls_spent`, including a refusal, failure, timeout, or server-cache hit; no automatic retry escapes that budget.

## Fail conditions
- A live call before the user agreed to the spend.
- A city or state passed to ranked_keywords or keyword_research.
- A second ranked_keywords call for the same domain.
- A ranked_keywords call for a domain whose saved list was reusable, when no fresh pull was asked for.
- A list with source data older than seven days, unknown source age, or pulled with a different location, language or limit, reused.
- A "fresh" request that omits `fresh: true` from either ranked_keywords or a needed keyword_research call.
- A cached response's source timestamp replaced with today's file-write date, or a response without `cached_at` presented as definitely new.
- A stopped run that retries a 429 or timeout automatically, makes another live call after a pause/archive/quota/upstream failure, or counts only successful calls against the run budget.
- A reused list shown with no date, or its figures presented as today's.
- Rows from a saved list and from a fresh call mixed for the same domain.
- A saved list with fewer rows than the tool returned, or with rows cleaned or re-sorted before saving.
- A competitor's brand name kept as a gap keyword.
- A search volume that appears in no tool result.
- Any SEO Genius write tool called, or any page edited.
