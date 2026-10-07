---
name: keyword-gap
description: Keyword gap analysis against the top competitors, using SEO Genius. Use for "what keywords do my competitors rank for that I don't", "keyword gap", "find keyword opportunities against my competitors", "where am I behind my competitors", or as the monthly step after competitor-dive. Pulls the ranking keywords of the site and of its three competitors, removes brand and out-of-area terms, and groups what is left into topics that show where the site is missing or behind, with search volume. Saves the result to .seo-genius/ for content-plan. Spends Data-for-SEO quota, one call per domain (four at most) plus one optional call, and reuses a list it saved in the last seven days instead of calling again. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: keyword gap

What the top competitors rank for and this site does not, grouped into topics a page can be built around.

## When to use

"what keywords do my competitors rank for that I don't", "keyword gap", "find keyword opportunities against my competitors", "where am I behind my competitors". Also as the monthly step after `/seo-genius:competitor-dive` and before `/seo-genius:content-plan`.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search to fit the mode. `search_pages` is a vector search on some accounts and a text search on others; the response's `mode` says which ran, so remember it. In `vector` mode, or before the mode is known, send a descriptive phrase ("concrete driveway installation service page"), never a single word. In `text` mode every word has to match the page's title, meta description, H1 or URL, so send two or three words the title or H1 would carry ("driveway installation"); after a long phrase missed, search once more that way, once only. Still no match: page through `list_pages` without `q`; `q` there is the same text search.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Files

- Reads `.seo-genius/config.json` (from `/seo-genius:start`) and `.seo-genius/competitors.json` (from `/seo-genius:competitor-dive`).
- Writes `.seo-genius/keyword-gap.md` and `.seo-genius/keyword-gap.json`, replacing the previous run. The folder sits at the repository root, or in the current folder when there is no repository.
- Reads and writes `.seo-genius/keyword-lists/`: one `<domain>.json` per domain, and `local-terms.json`. Each holds every row of one list in a compact form, with the date it was pulled, so a later run can read it instead of paying for the same call (step 3).
- The files are meant to be kept with the site. Never write a token, key, or password into them.
- If the session cannot write files, show the report in the reply and say it was not saved.
- This skill writes nothing to SEO Genius and edits no page.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. Competitors. Read the `domain` of each entry in `competitors` from `.seo-genius/competitors.json`. No file: use the domains the user names, three at most. None named: stop and say to run `/seo-genius:competitor-dive` first. Read `services`, `city`, `other_cities`, `country`, `country_code`, and `terms` from the config; with no config, read the same facts from `get_business_context`.
3. Check what is on file, then say what the run spends before spending it.
   - For this site and each competitor, read `.seo-genius/keyword-lists/<domain>.json`. Reuse a saved list only when all of these hold: the file parses; its `domain` is this domain; `pulled_on` is today or one of the seven days before it; `location_name`, `language_name`, and `limit` are the ones step 4 would send; and `rows` is not empty. A domain whose file fails any of these needs a call.
   - When the user asks for a fresh pull ("fresh", "pull again", "ignore the saved lists"), every domain needs a call and no file is reused. Also bypass the server cache: send `fresh: true` on each `ranked_keywords` call and any `keyword_research` call. Ignoring local files alone cannot guarantee new DataForSEO data.
   - Name each domain as on file, with its `pulled_on` date, or as needing a call. Then give the total: one `ranked_keywords` call per domain that needs one (four at most), plus one `keyword_research` call if step 7 finds local terms that are not on file. Wait for a yes. That yes covers both.
   - When no domain needs a call, say so and go on without waiting. Nothing is spent. If step 7 then needs its one call, ask before making it.
4. `ranked_keywords` for each domain that needs a call: `domain`, `location_name: "<Country>"`, `language_name: "English"`, `limit: 200`, and `fresh: true` when the user requests a fresh pull. One call per domain. Country level only (rule 4). Each row has `keyword`, `url`, `position`, `search_volume`, `cpc`, `competition`, `intent`.
   - As soon as a call answers with rows, save them to `.seo-genius/keyword-lists/<domain>.json` in the compact form of step 10, before the next call, replacing any older file for that domain. A call that fails or returns no rows saves nothing.
   - Preserve data provenance: when the response has `cached_at`, use its date for `pulled_on`, never today. When `cached_at` is absent, the server may have fetched fresh data or served shared cache data without revealing another tenant's cache date. For an ordinary call set `pulled_on: null`, report the date as unknown and do not reuse the list later. When `fresh: true` was sent, record today because the server bypasses its cache. Do not imply a cached response was newly fetched.
   - A domain whose list is reused gets no call. Read its `rows` from the file. Never mix rows from a saved list with rows from a fresh call for the same domain.
   - Positions and volumes in a reused list are as of its `pulled_on` date, not today. Carry that date with the list.
   - Rows come ordered by search volume, so a domain that returns 200 rows may rank for more than was read. Note which domains hit that cap.
   - `position` counts every block on the results page (ads, the map, questions), the same way `rank` does in a live search. "Top 10" and "top 20" below are approximate cut-offs, not organic places.
5. Clean each competitor's list, and count what each rule removes:
   - Brand: the keyword contains a business name, a competitor's or anyone else's.
   - Out of area: the keyword names a city or region this site does not serve.
   - Unrelated: the keyword has nothing to do with the services this site offers.
   Then keep the competitor rows with `position` 20 or better.
6. Sort every keyword that is left into exactly one class:
   - Missing: this site has no row for it. Mark it strong when two or more competitors rank.
   - Behind: this site has a row and at least one competitor ranks better. Keep both positions, so the size of the gap shows.
   - Holding: this site ranks as well as or better than every competitor. Count these; do not list them.
   When this site's own list hit the 200-row cap, a missing keyword means "not among this site's 200 highest-volume keywords". Say so; absence from a capped list is not proof.
7. Local terms nobody ranks for. Take `terms` from the config, plus each service paired with each of `other_cities`, and keep the ones that appear in no list. If there are any, read `.seo-genius/keyword-lists/local-terms.json` first. Reuse it when `pulled_on` is today or one of the seven days before it, its `location_code` is the country code, every term needed now is in `asked`, and the user did not ask for a fresh pull. Otherwise: one `keyword_research` call with the whole batch (200 at most) and the country `location_code`; send `fresh: true` when requested. Save the answer immediately. Set `pulled_on` from `cached_at` when supplied; when absent and not a forced fresh pull, set `pulled_on: null` and explain that its age cannot be confirmed.
   - A term that comes back with volume has demand, and no competitor ranks for it in the lists that were read. Keep it in `local_terms`. Absence from those lists is not proof that nobody ranks. Look the term up in `terms` in `.seo-genius/competitors.json`: when the live search there shows a business above this site, the term is contested. Save it with `contested: true` and the domains above this site, and say so in the reply. Call a term open ground only when that search was run and shows no business above this site. A term with no live search on file is "not checked in a live search".
   - A local term often has no volume at country level. Report that as "no volume data", never as zero, and keep it in `local_terms_no_data`.
8. Group into topics. One topic per service, and one per guide subject that shows up (cost, permits, materials, how to choose). For each topic: its keywords, the total search volume from the tool, which competitors rank and with which URL, this site's best position and URL, and missing or behind. A topic is missing when this site has no row for any of its keywords, and behind otherwise. A topic is strong when at least one of its keywords is strong.
9. Order the topics: strong missing first, then missing, then behind, each by total search volume. Save the sixty highest-volume keywords across all topics, and say how many were left out.
10. Save both files (see Files). `keyword-gap.md` is the report as shown in the reply. `keyword-gap.json`:

    ```json
    {
      "generated": "YYYY-MM-DD",
      "site": "example.com",
      "country": "United States",
      "competitors": ["a.example"],
      "lists": [{ "domain": "example.com", "pulled_on": "YYYY-MM-DD", "reused": false }],
      "local_terms_pulled_on": null,
      "rows_read": { "example.com": 0, "a.example": 0 },
      "cap_hit": [""],
      "dropped": { "brand": 0, "out_of_area": 0, "unrelated": 0 },
      "topics": [
        {
          "topic": "",
          "class": "missing",
          "strong": true,
          "volume": 0,
          "keywords": [
            {
              "keyword": "",
              "class": "missing",
              "volume": 0,
              "intent": "",
              "site_position": null,
              "site_url": null,
              "competitors": [{ "domain": "", "position": 0, "url": "" }]
            }
          ]
        }
      ],
      "local_terms": [{ "term": "", "volume": 0, "contested": null, "above": [""] }],
      "local_terms_no_data": [""],
      "holding": 0,
      "keywords_left_out": 0,
      "calls_spent": 0
    }
    ```

    `class` is `missing` or `behind`, on the topic and on each keyword. `cap_hit` lists the domains that returned 200 rows. Positions are as the tool reports them. `lists` has one entry per domain, this site included; `reused` is true when the list came from a file. `local_terms_pulled_on` is the date of the local-terms lookup that was used, or null when there was none. `calls_spent` counts the live calls made in this run only.

    A saved list, `.seo-genius/keyword-lists/<domain>.json`:

    ```json
    {
      "domain": "a.example",
      "pulled_on": "YYYY-MM-DD",
      "location_name": "United States",
      "language_name": "English",
      "limit": 200,
      "cap_hit": false,
      "url_base": "https://www.a.example",
      "columns": ["keyword", "url", "position", "search_volume", "intent"],
      "rows": [
        ["tree removal boise", "/tree-removal", 4, 90, "commercial"]
      ]
    }
    ```

    - One array per row, one row per line, values in the order of `columns`. Save every row the tool returned, in the order returned, uncleaned. Cleaning and sorting happen on each run, so a change to the competitor set or to the services does not need a new call.
    - Keep these five fields and no others. No step reads the rest of what the tool returns. A value the tool did not give is `null`.
    - `url_base`: when every row's `url` starts with the same scheme and host, save that once and keep only what follows it in each row (`/` for the home page). The full URL is `url_base` followed by the row's value. When the rows do not all share one scheme and host, set `url_base` to an empty string and keep each URL whole.
    - Written this way a list is about a quarter of the size of one object per row with every field, and writing it is most of what a fresh pull costs.
    - A file from an earlier version, with one object per row and no `columns`, is still read: take the same five fields from each object.

    The saved local-terms lookup, `.seo-genius/keyword-lists/local-terms.json`:

    ```json
    {
      "pulled_on": "YYYY-MM-DD",
      "location_code": 2840,
      "asked": [""],
      "columns": ["keyword", "search_volume"],
      "rows": [
        ["tree removal boise", 90]
      ]
    }
    ```

    `asked` is every term that was sent, so a term that came back with no data is still known to have been looked up. `rows` holds what came back, one array per term, with `null` where the tool gave no volume.

## Output

- One line: site, domain, `can_write`.
- Topics table: Topic | Missing or behind | Total volume | Top keywords | Competitors ranking | This site's best position.
- Lists: each domain as pulled in this run or reused, with the date a reused list was pulled. Say that positions and volumes in a reused list are as of that date.
- Counts: rows read per domain, rows removed by each rule, keywords this site is holding, domains that hit the 200-row cap.
- Local terms with volume that are in no list, each marked open ground, contested, or not checked in a live search, then local terms with no volume data.
- Where the files were saved, or that they were not.
- Closing line per rule 9, with the number of live calls spent and the note that every position and volume is country-level and every position counts all blocks on the page.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `ranked_keywords` returns nothing for this site: say the site has no ranking keywords recorded at country level, and treat every competitor keyword as missing. Do not retry with a city or state; those return nothing on this tool.
- `ranked_keywords` returns nothing for a competitor: say so and continue with the others.
- A saved list that does not parse, or has no `rows`: do not use it. Count that domain as needing a call, and say the saved file was unusable.
- The session cannot write files: every domain needs a call each run, because no list can be saved. Say so when stating the spend.
- `upstream_unavailable` on a call: report it, skip that domain, keep the rest.
- Rate limited (429): if the message is `quota_exceeded`, stop and report that the monthly quota is exhausted rather than recommending a retry in one minute. For other rate limits, stop and report the actual retry guidance, if supplied.

## Done when

- The user agreed to the spend, including the possible `keyword_research` call, before the first live call.
- At most one `ranked_keywords` call per domain, four domains at most, none for a domain whose saved list was reused, and at most one `keyword_research` call.
- Every list pulled in this run was saved under `.seo-genius/keyword-lists/` with every row, in the compact form, and every reused list is named with the date it was pulled.
- Every kept keyword is in exactly one class, and the number holding is stated.
- Every volume and position comes from a tool result and is labeled country-level.
- The counts of removed rows and the capped domains are stated.
- Both files were saved, or the reply says they were not.
- Nothing was written to SEO Genius and no page was edited.
