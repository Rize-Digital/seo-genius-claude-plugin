# Acceptance: /seo-genius:keyword-gap

## Legacy fallback smoke prompts (paid calls require approval)
1. `/seo-genius:keyword-gap` in a repository that has `.seo-genius/competitors.json` with three competitors.
2. "What keywords do my competitors rank for that I don't?" naming two competitor domains, in a folder with no research files.
3. `/seo-genius:keyword-gap` in a folder with no research files and no domains named.
4. `/seo-genius:keyword-gap` again within seven days of prompt 1, after one competitor in `competitors.json` was replaced by a new domain.
5. "Run the keyword gap again with a fresh pull", within seven days of prompt 1.
6. A `ranked_keywords` response reports `cached_at` six days ago even though the call was made today.
7. A `ranked_keywords` response has no `cached_at` on a normal request, so it may represent a shared-cache hit of unknown age.
8. A fresh-pull request with local terms also needs one `keyword_research` call.
9. A paid call gets 409 `site_paused`, 429 `quota_exceeded`, or two consecutive `upstream_unavailable` responses.

## Expected legacy fallback tool sequence
get_my_tenant -> list_sites -> [read competitors.json and config, or get_business_context] -> [read .seo-genius/keyword-lists/ and sort each domain into on file or needs a call] -> [state the spend, wait for a yes when any call is needed] -> ranked_keywords (country, limit 200) only for the domains that need a call, each saved to keyword-lists/<domain>.json as it answers -> [keyword_research once, only for local terms that appear in no list and are not on file] -> write .seo-genius/keyword-gap.md and keyword-gap.json

## Legacy fallback pass conditions
- [ ] The reply states the number of live calls, including the possible keyword_research call, and waits for a yes before the first one.
- [ ] At most one ranked_keywords call per domain, four domains at most, each at country level with limit 200, and none for a domain whose saved list was reused.
- [ ] Before the spend is stated, each domain is named as on file with its date or as needing a call.
- [ ] A saved list is reused only when it parses, is for that domain, was pulled seven days ago or less, was pulled with the same location, language and limit, and has rows. A file that fails any of these gets a fresh call.
- [ ] Every list pulled in the run is saved to .seo-genius/keyword-lists/<domain>.json with its pulled_on date and every row in the order returned, as one array per row under columns (keyword, url, position, search_volume, intent).
- [ ] For every saved row the five values equal the tool result. With url_base set, url_base followed by the row's value is the returned URL; with rows on more than one host, url_base is empty and each URL is whole.
- [ ] A file saved by an earlier version, with one object per row and no columns, is still reused.
- [ ] The reply names each list as pulled in this run or reused, gives the date of each reused list, and says its positions and volumes are as of that date.
- [ ] Prompt 4: exactly one ranked_keywords call, for the new domain; the other three lists are reused; keyword rows from reused lists still carry intent.
- [ ] Prompt 5: one ranked_keywords call per domain, and no saved file is reused.
- [ ] Prompt 5: each `ranked_keywords` call includes `fresh: true`; local-file bypass alone does not count as a fresh pull.
- [ ] Prompt 6: saved `pulled_on` equals the `cached_at` date, not today, and output labels the data as cached.
- [ ] Prompt 7: `pulled_on` is null, source age is reported unknown, and the list is not eligible for reuse on the next run.
- [ ] Prompt 8: `keyword_research` includes `fresh: true` and any returned `cached_at` or unknown age is handled like ranked keywords.
- [ ] Prompt 9: no retry on a paused site or exhausted quota, and no false gap conclusion from a failed source list.
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

## Preferred server keyword-gap and research-store acceptance
- [ ] With server `keyword_gap` available, the run calls it once for up to three in-area competitors and does not also call `ranked_keywords`.
- [ ] The worst-case quota budget is explained before spending: up to four ranked-keyword lists through a single server call, plus one optional local-term call; cached lists may refund quota.
- [ ] `fresh: true` reaches the server tool when fresh data is explicitly requested; the result's list `cached_at`, `cap_hit`, `status`, `rows_left_out`, and `compared` fields are preserved.
- [ ] When Node is available, the compact response passes `plugins/seo-genius/scripts/normalize-server-keyword-gap.mjs`; columns may arrive in any order and a different target site is rejected.
- [ ] Branded, out-of-area and irrelevant rows are filtered AFTER the server comparison; no false local service gaps are created from unfiltered country-level rows.
- [ ] Resulting `keyword-gap.json` retains the legacy `topics`, `local_terms` and counts shape so content-plan can read it.
- [ ] When authorized, `save_research(kind: keyword_gap)` stores `analysis`, optional `source_gap`, and `report` with a verified research ID. A fresh run with no local files reads it again.
- [ ] A missing server tool uses the legacy fallback after disclosing the limitation; an errored paid server request NEVER triggers a second billed fallback.
- [ ] Read-only connections, unavailable store migrations, dropped sections, paused sites, exhausted quota and partial failed competitor lists are reported accurately.

## Fail conditions
- A live call before the user agreed to the spend.
- Fresh pull requested but `fresh: true` omitted on a live DataForSEO call.
- A server-cache hit stamped with today when `cached_at` indicated an older date.
- A non-forced result without `cached_at` advertised as freshly fetched.
- Monthly `quota_exceeded` presented as a short-term throttle that should be retried in a minute.
- Continued spending quota after the site is paused or two consecutive upstream failures.
- A city or state passed to ranked_keywords or keyword_research.
- A second ranked_keywords call for the same domain.
- A ranked_keywords call for a domain whose saved list was reusable, when no fresh pull was asked for.
- A list older than seven days, or pulled with a different location, language or limit, reused.
- A reused list shown with no date, or its figures presented as today's.
- Rows from a saved list and from a fresh call mixed for the same domain.
- A saved list with fewer rows than the tool returned, or with rows cleaned or re-sorted before saving.
- A competitor's brand name kept as a gap keyword.
- A search volume that appears in no tool result.
- An SEO Genius write other than an explicitly approved `save_research`, or any website page edited.
